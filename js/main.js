/**
 * RunLoop — Ponto de Entrada Principal da Aplicação (Mobile-First / Estilo Strava)
 * 
 * Orquestra o mapa em tela cheia, localização automática resiliente,
 * bottom sheet encaixável com snaps, rastreador de corrida com wake lock,
 * e modo de desenho manual.
 */

import { CONFIG } from './config.js';
import {
  initMap,
  setStartPoint,
  getStartPoint,
  setMapClickHandler,
  updateUserMarker,
  flyToUserLocation,
  renderRoute,
  fitRouteBounds,
  renderManualDraw,
  clearRouteLayers,
  clearManualLayers,
  clearAllRoutes,
  updateLiveRunTrail,
  clearLiveRunTrail
} from './map.js';
import { store, APP_STATES } from './store.js';
import { BottomSheet, SHEET_SNAPS } from './sheet.js';
import { LocationManager } from './locator.js';
import { RunTracker, TRACKER_STATES } from './tracker.js';
import { generateLoopRoute } from './loop-generator.js';
import {
  addManualPoint,
  undoManualPoint,
  clearManualPoints,
  onDrawChange,
  getManualPoints
} from './draw-mode.js';
import { UI } from './ui.js';

let sheet = null;
let locator = null;
let tracker = null;

let activeAbortController = null;
let activeGenerationId = 0;
let currentRotationSeed = 0;
let lastGeneratedRoute = null;

/**
 * Inicialização ao carregar a página
 */
function init() {
  // 1. Inicializa o mapa com visão neutra de fundo
  initMap('map', CONFIG.DEFAULT_MAP_VIEW);

  // 2. Inicializa o gerenciador do Bottom Sheet móvel
  sheet = new BottomSheet(UI.routeSheet, {
    handle: UI.sheetHandleZone,
    onSnapChange: (snap) => {
      const isVisible = snap !== SHEET_SNAPS.HIDDEN;
      UI.dockBtnLoop.classList.toggle('active', isVisible);

      // Resumo compacto visível apenas no snap 'compact'
      if (UI.sheetCompactSummary) {
        UI.sheetCompactSummary.hidden = (snap !== SHEET_SNAPS.COMPACT);
      }

      // Oculta stats card quando o sheet está aberto
      if (store.getState().appState !== APP_STATES.CORRENDO && store.getState().appState !== APP_STATES.PAUSADO) {
        UI.statsCard.hidden = (snap === SHEET_SNAPS.HALF || snap === SHEET_SNAPS.FULL);
      }
    }
  });

  // 3. Inicializa o Rastreador de Corrida (GPS)
  tracker = new RunTracker({
    onPointAccepted: (sample) => {
      updateUserMarker(sample.lat, sample.lng, sample.accuracy);
      const metrics = tracker.getMetrics();
      updateLiveRunTrail(metrics.coordinates);
    },
    onMetricsUpdate: (metrics) => {
      UI.updateStats(
        metrics.timeFormatted,
        metrics.paceFormatted,
        metrics.distanceKmFormatted
      );
    },
    onWakeLockStatus: (status) => {
      if (status === 'UNSUPPORTED' || status === 'DENIED') {
        const textSpan = UI.runWakeLockNotice.querySelector('span');
        if (textSpan) {
          textSpan.textContent = 'Mantenha a tela ligada manualmente. O GPS pode pausar se a tela apagar.';
        }
      }
    }
  });

  // 4. Inicializa o Gerenciador de Localização Automática
  locator = new LocationManager({
    onSuccess: ({ lat, lng, accuracy }) => {
      updateUserMarker(lat, lng, accuracy);
      // Define ponto de partida inicial automaticamente na posição do usuário
      setStartPoint(lat, lng, false);
      UI.setStartCoordsDisplay(lat, lng);
      flyToUserLocation(lat, lng, { zoom: 16, duration: 1.6, bottomOffsetPx: 120 });
    },
    onError: (title, message) => {
      UI.showToast(`${title}: ${message}`, 5000);
    },
    onStatusChange: (statusText, statusKey) => {
      const state = store.getState();
      UI.setGpsStatus(statusKey || state.gpsStatus, statusText);
    }
  });

  // 5. Conecta ouvintes de eventos da UI
  setupTopBar();
  setupBottomDock();
  setupDistanceInput();
  setupRouteSheet();
  setupManualDrawing();
  setupRunningControls();
  setupMapInteractions();

  // 6. Inscreve a UI às mudanças da máquina de estados
  setupStoreSubscription();

  // 7. Dispara a localização automática logo na inicialização
  locator.requestLocation(false);
}

/**
 * Conecta ações da barra superior (chip de GPS e menu Mais)
 */
function setupTopBar() {
  // Toque no chip de GPS tenta localizar novamente
  UI.chipGpsStatus.addEventListener('click', () => {
    locator.requestLocation(true);
  });

  // Botão Mais (⋯) abre popover com recursos futuros desabilitados
  UI.btnMoreMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = UI.popoverMoreMenu.hidden;
    UI.popoverMoreMenu.hidden = !isHidden;
    UI.btnMoreMenu.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
  });

  document.addEventListener('click', (e) => {
    if (!UI.popoverMoreMenu.hidden && !UI.btnMoreMenu.contains(e.target) && !UI.popoverMoreMenu.contains(e.target)) {
      UI.popoverMoreMenu.hidden = true;
      UI.btnMoreMenu.setAttribute('aria-expanded', 'false');
    }
  });

  // Botão flutuante de recentralizar
  UI.btnRecenter.addEventListener('click', () => {
    const state = store.getState();
    if (state.userLocation) {
      flyToUserLocation(state.userLocation.lat, state.userLocation.lng, { zoom: 16 });
    } else if (state.startPoint) {
      flyToUserLocation(state.startPoint.lat, state.startPoint.lng, { zoom: 16 });
    } else {
      locator.requestLocation(true);
    }
  });
}

/**
 * Conecta ações da barra inferior (Dock)
 */
function setupBottomDock() {
  // Ação 1: Rota Loop (abre/fecha sheet)
  UI.dockBtnLoop.addEventListener('click', () => {
    const currentSnap = sheet.getSnap();
    if (currentSnap === SHEET_SNAPS.HIDDEN) {
      // Se já tem rota gerada, abre no compacto, senão na metade
      if (lastGeneratedRoute) {
        sheet.setSnap(SHEET_SNAPS.COMPACT);
      } else {
        sheet.setSnap(SHEET_SNAPS.HALF);
      }
      store.transitionTo(APP_STATES.PLANEJANDO);
    } else {
      sheet.setSnap(SHEET_SNAPS.HIDDEN);
      store.transitionTo(APP_STATES.REPOUSO);
    }
  });

  // Ação 2: Iniciar Corrida
  UI.dockBtnStart.addEventListener('click', () => {
    sheet.setSnap(SHEET_SNAPS.HIDDEN);
    const state = store.getState();
    const initialPos = state.userLocation || state.startPoint;
    tracker.startRun(initialPos);
  });

  // Ação 3: Modo Desenhar
  UI.dockBtnDraw.addEventListener('click', () => {
    sheet.setSnap(SHEET_SNAPS.HIDDEN);
    store.transitionTo(APP_STATES.DESENHANDO);
  });
}

/**
 * Conecta formulário e ações dentro do Bottom Sheet de Rota Loop
 */
function setupDistanceInput() {
  const input = UI.inputDistance;

  input.addEventListener('input', () => {
    const val = parseFloat(input.value.replace(',', '.'));
    if (!isNaN(val)) {
      UI.syncPresetChips(val);
      UI.showDistanceError(null);
      store.setState({ targetKm: val });
    }
  });

  UI.btnDistMinus.addEventListener('click', () => {
    const val = parseFloat(input.value.replace(',', '.')) || CONFIG.DEFAULT_DISTANCE_KM;
    const newVal = Math.max(CONFIG.MIN_DISTANCE_KM, val - 0.5);
    input.value = newVal;
    input.dispatchEvent(new Event('input'));
  });

  UI.btnDistPlus.addEventListener('click', () => {
    const val = parseFloat(input.value.replace(',', '.')) || CONFIG.DEFAULT_DISTANCE_KM;
    const newVal = Math.min(CONFIG.MAX_DISTANCE_KM, val + 0.5);
    input.value = newVal;
    input.dispatchEvent(new Event('input'));
  });

  UI.presetChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const km = parseFloat(chip.dataset.km);
      input.value = km;
      input.dispatchEvent(new Event('input'));
    });
  });
}

function setupRouteSheet() {
  UI.btnCloseSheet.addEventListener('click', () => {
    sheet.setSnap(SHEET_SNAPS.HIDDEN);
    store.transitionTo(APP_STATES.REPOUSO);
  });

  // Toque no resumo compacto expande o sheet para visualização dos dados completos
  if (UI.sheetCompactSummary) {
    UI.sheetCompactSummary.addEventListener('click', () => {
      sheet.setSnap(SHEET_SNAPS.HALF);
    });
  }

  // Botão Gerar Rota Loop
  UI.btnGenerateRoute.addEventListener('click', () => {
    currentRotationSeed = Math.floor(Math.random() * 60);
    triggerRouteGeneration();
  });

  // Botão Gerar Outro Traçado
  UI.btnRegenerateRoute.addEventListener('click', () => {
    currentRotationSeed = (currentRotationSeed + 72 + Math.floor(Math.random() * 20)) % 360;
    triggerRouteGeneration();
  });
}

/**
 * Geração de rota circular via loop-generator.js
 */
async function triggerRouteGeneration() {
  const startPoint = getStartPoint();
  if (!startPoint) {
    UI.showToast('Defina um ponto de partida tocando no mapa.', 4000);
    UI.setErrorState('Defina um ponto de partida', 'Toque em qualquer rua no mapa para escolher onde começar.');
    return;
  }

  const valResult = UI.validateDistance();
  if (!valResult.isValid) {
    UI.showDistanceError(valResult.errorMsg);
    return;
  }
  UI.showDistanceError(null);

  cancelActiveRequest();
  const generationId = ++activeGenerationId;
  activeAbortController = new AbortController();

  const requestedKm = valResult.valueKm;

  store.transitionTo(APP_STATES.GERANDO);
  UI.setLoadingState(true, 'Planejando circuito…', 'Iniciando primeira iteração…', 1, CONFIG.MAX_ATTEMPTS);

  try {
    const route = await generateLoopRoute({
      startPoint,
      requestedDistanceKm: requestedKm,
      rotationOffset: currentRotationSeed,
      tolerancePercent: CONFIG.DEFAULT_TOLERANCE_PERCENT,
      signal: activeAbortController.signal,
      onProgress: ({ attempt, maxAttempts, status }) => {
        if (generationId === activeGenerationId) {
          UI.setLoadingState(true, 'Ajustando traçado…', status, attempt, maxAttempts);
        }
      }
    });

    if (generationId === activeGenerationId) {
      lastGeneratedRoute = route;
      renderRoute(route);
      UI.populateResultCard(route);

      // Ao gerar, vai para o modo compacto com o resumo
      sheet.setSnap(SHEET_SNAPS.COMPACT);
      store.transitionTo(APP_STATES.ROTA_PRONTA, { routeData: route });
    }
  } catch (err) {
    if (generationId !== activeGenerationId) return;

    if (err.name === 'AbortError') {
      UI.setLoadingState(false);
      store.transitionTo(APP_STATES.PLANEJANDO);
      return;
    }

    console.error('Falha na geração de rota:', err);
    UI.setErrorState('Não foi possível traçar a rota', err.message || 'Tente selecionar outro ponto de partida.');
    store.transitionTo(APP_STATES.PLANEJANDO);
  } finally {
    if (generationId === activeGenerationId) {
      activeAbortController = null;
      UI.setLoadingState(false);
    }
  }
}

function cancelActiveRequest() {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
}

/**
 * Conecta o modo de desenho manual
 */
function setupManualDrawing() {
  onDrawChange(({ points, totalMeters }) => {
    renderManualDraw(points);
    const kmFormatted = (totalMeters / 1000).toFixed(2).replace('.', ',');
    UI.drawDistanceValue.textContent = `${kmFormatted} km`;
    UI.btnDrawUndo.disabled = (points.length === 0);
    UI.btnDrawClear.disabled = (points.length === 0);
    store.setState({ drawPoints: points, drawDistanceMeters: totalMeters });
  });

  UI.btnDrawUndo.addEventListener('click', () => {
    undoManualPoint();
  });

  UI.btnDrawClear.addEventListener('click', () => {
    clearManualPoints();
    clearManualLayers();
  });

  UI.btnDrawFinish.addEventListener('click', () => {
    store.transitionTo(APP_STATES.REPOUSO);
  });
}

/**
 * Controles de corrida ativa e modais
 */
function setupRunningControls() {
  // Pausar / Continuar
  UI.btnRunPauseResume.addEventListener('click', () => {
    if (tracker.state === TRACKER_STATES.CORRENDO) {
      tracker.pauseRun();
      UI.btnRunPauseText.textContent = 'Continuar';
      UI.btnRunPauseResume.style.background = '#10b981';
    } else if (tracker.state === TRACKER_STATES.PAUSADO) {
      tracker.resumeRun();
      UI.btnRunPauseText.textContent = 'Pausar';
      UI.btnRunPauseResume.style.background = '#f59e0b';
    }
  });

  // Finalizar (abre modal de confirmação)
  UI.btnRunFinish.addEventListener('click', () => {
    UI.confirmFinishModal.hidden = false;
  });

  UI.btnCancelFinish.addEventListener('click', () => {
    UI.confirmFinishModal.hidden = true;
  });

  UI.btnConfirmFinish.addEventListener('click', () => {
    UI.confirmFinishModal.hidden = true;
    const finalMetrics = tracker.stopRun();

    UI.summaryDistance.textContent = `${finalMetrics.distanceKmFormatted} km`;
    UI.summaryTime.textContent = finalMetrics.timeFormatted;
    UI.summaryPace.textContent = `${finalMetrics.paceFormatted} /km`;
    UI.runSummaryModal.hidden = false;
  });

  UI.btnCloseSummary.addEventListener('click', () => {
    UI.runSummaryModal.hidden = true;
    tracker.reset();
    clearLiveRunTrail();
  });
}

/**
 * Interações no mapa
 */
function setupMapInteractions() {
  setMapClickHandler((coords) => {
    const currentState = store.getState().appState;

    if (currentState === APP_STATES.DESENHANDO) {
      addManualPoint(coords.lat, coords.lng);
      return;
    }

    if (currentState === APP_STATES.CORRENDO || currentState === APP_STATES.PAUSADO) {
      // Durante a corrida, toques no mapa não alteram o ponto de início
      return;
    }

    // Em modo normal, define ou move o ponto de partida
    setStartPoint(coords.lat, coords.lng, false);
    UI.setStartCoordsDisplay(coords.lat, coords.lng);
    store.setState({ startPoint: coords });

    // Se já havia uma rota gerada, limpa para incentivar novo traçado
    if (lastGeneratedRoute) {
      clearRouteLayers();
      lastGeneratedRoute = null;
      UI.resultCard.hidden = true;
      UI.btnRegenerateRoute.hidden = true;
    }
  });
}

/**
 * Assinatura do Store para refletir mudanças globais de estado na UI
 */
function setupStoreSubscription() {
  store.subscribe((state, prevState) => {
    const appState = state.appState;

    // Alterna visualização do Dock e Barras Auxiliares
    if (appState === APP_STATES.CORRENDO || appState === APP_STATES.PAUSADO) {
      UI.bottomDock.hidden = true;
      UI.drawModeBar.hidden = true;
      UI.runActiveBar.hidden = false;
      UI.statsCard.hidden = false;
      sheet.setSnap(SHEET_SNAPS.HIDDEN);
    } else if (appState === APP_STATES.DESENHANDO) {
      UI.bottomDock.hidden = true;
      UI.runActiveBar.hidden = true;
      UI.statsCard.hidden = true;
      UI.drawModeBar.hidden = false;
      sheet.setSnap(SHEET_SNAPS.HIDDEN);
      clearRouteLayers();
      renderManualDraw(getManualPoints());
    } else {
      UI.bottomDock.hidden = false;
      UI.runActiveBar.hidden = true;
      UI.drawModeBar.hidden = true;
      // Restaura stats card se o sheet não estiver em tela cheia/metade
      UI.statsCard.hidden = (sheet.getSnap() === SHEET_SNAPS.HALF || sheet.getSnap() === SHEET_SNAPS.FULL);
      clearManualLayers();
      if (lastGeneratedRoute) {
        renderRoute(lastGeneratedRoute);
      }
    }
  });
}

// Inicializa a aplicação quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
