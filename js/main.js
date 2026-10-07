/**
 * RunLoop — Ponto de Entrada Principal da Aplicação (Mobile-First / Estilo Strava)
 * 
 * Orquestra o mapa em tela cheia, localização automática resiliente,
 * bottom sheet encaixável com snaps, rastreador de corrida com wake lock,
 * modo de desenho manual e modo de escolha de pontos (Início e Fim).
 */

import { CONFIG } from './config.js';
import {
  initMap,
  setStartPoint,
  getStartPoint,
  hasStartPoint,
  setEndPoint,
  getEndPoint,
  hasEndPoint,
  removeEndPoint,
  setMarkersDraggable,
  setMarkerDragEndHandler,
  setMapDragStartHandler,
  panToRunner,
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
import { fetchRoute } from './routing.js';
import { haversineDistance } from './geo.js';
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

let isFollowingRunner = true;
let activePickTarget = 'start'; // 'start' | 'end'
let isInternalHistoryNav = false;

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
      const curState = store.getState().appState;
      if (curState !== APP_STATES.CORRENDO && curState !== APP_STATES.PAUSADO && curState !== APP_STATES.ESCOLHENDO_PONTOS) {
        UI.statsCard.hidden = (snap === SHEET_SNAPS.HALF || snap === SHEET_SNAPS.FULL);
      }

      // Se foi arrastado para oculto pelo usuário, volta ao estado de repouso
      if (snap === SHEET_SNAPS.HIDDEN) {
        if (curState === APP_STATES.PLANEJANDO || curState === APP_STATES.ROTA_PRONTA) {
          store.transitionTo(APP_STATES.REPOUSO);
        }
        if (window.location.hash === '#rota') {
          isInternalHistoryNav = true;
          history.back();
          setTimeout(() => { isInternalHistoryNav = false; }, 100);
        }
      }
    }
  });
  window._sheet = sheet;

  // 3. Inicializa o Rastreador de Corrida (GPS)
  tracker = new RunTracker({
    onPointAccepted: (sample) => {
      updateUserMarker(sample.lat, sample.lng, sample.accuracy);
      const metrics = tracker.getMetrics();
      updateLiveRunTrail(metrics.coordinates);

      // Segue o corredor automaticamente enquanto não houver arraste manual
      if (store.getState().appState === APP_STATES.CORRENDO && isFollowingRunner) {
        panToRunner(sample.lat, sample.lng);
      }
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
      UI.setStartButtonWaiting(false);

      // Define ponto de partida inicial automaticamente se nenhum foi definido pelo usuário
      if (!hasStartPoint()) {
        setStartPoint(lat, lng, false);
        store.setState({ startPoint: { lat, lng } });
        UI.setStartCoordsDisplay(lat, lng);
      }

      flyToUserLocation(lat, lng, { zoom: 16, duration: 1.6, bottomOffsetPx: 120 });
    },
    onError: (title, message) => {
      UI.showToast(`${title}: ${message}`, 5000);
    },
    onStatusChange: (statusText, statusKey) => {
      const state = store.getState();
      UI.setGpsStatus(statusKey || state.gpsStatus, statusText);
      if (!state.userLocation) {
        UI.setStartButtonWaiting(true);
      }
    }
  });

  // 5. Conecta ouvintes de eventos da UI
  setupTopBar();
  setupBottomDock();
  setupDistanceInput();
  setupRouteSheet();
  setupManualDrawing();
  setupPickPointsMode();
  setupRunningControls();
  setupMapInteractions();

  // 6. Inscreve a UI às mudanças da máquina de estados
  setupStoreSubscription();

  // 7. Botão Iniciar começa em estado de espera até obter GPS
  UI.setStartButtonWaiting(true);

  // 8. Dispara a localização automática logo na inicialização
  locator.requestLocation(false);
}

/**
 * Fecha o menu popover 'Mais' (⋯)
 */
function closeMoreMenu() {
  if (UI.popoverMoreMenu && !UI.popoverMoreMenu.hidden) {
    UI.popoverMoreMenu.hidden = true;
    UI.btnMoreMenu.setAttribute('aria-expanded', 'false');
  }
}

/**
 * Abre o Bottom Sheet de Rota com sincronização do histórico (#rota)
 * @param {'compact'|'half'|'full'} [snap=null] 
 */
function openRouteSheet(snap = null) {
  closeMoreMenu();
  if (store.getState().appState === APP_STATES.ESCOLHENDO_PONTOS) {
    exitPickPointsMode();
  }

  if (window.location.hash !== '#rota') {
    history.pushState({ panel: 'rota' }, '', '#rota');
  }

  const targetSnap = snap || (lastGeneratedRoute ? SHEET_SNAPS.COMPACT : SHEET_SNAPS.HALF);
  sheet.setSnap(targetSnap);
  store.transitionTo(lastGeneratedRoute ? APP_STATES.ROTA_PRONTA : APP_STATES.PLANEJANDO);
}

/**
 * Fecha o Bottom Sheet de Rota e restaura o histórico sem recarregar a página
 * @param {boolean} [restoreHistory=true] 
 */
function closeRouteSheet(restoreHistory = true) {
  const wasOpen = sheet.getSnap() !== SHEET_SNAPS.HIDDEN;
  sheet.setSnap(SHEET_SNAPS.HIDDEN);
  store.transitionTo(APP_STATES.REPOUSO);

  if (restoreHistory && wasOpen && window.location.hash === '#rota') {
    isInternalHistoryNav = true;
    history.back();
    setTimeout(() => { isInternalHistoryNav = false; }, 100);
  }
}

/**
 * Conecta ações da barra superior (chip de GPS e menu Mais)
 */
function setupTopBar() {
  // Toque no chip de GPS tenta localizar novamente
  UI.chipGpsStatus.addEventListener('click', () => {
    locator.requestLocation(true);
  });

  // Botão Mais (⋯) abre/fecha popover
  UI.btnMoreMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = UI.popoverMoreMenu.hidden;
    UI.popoverMoreMenu.hidden = !isHidden;
    UI.btnMoreMenu.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
  });

  // Fecha ao tocar fora (pointerdown)
  document.addEventListener('pointerdown', (e) => {
    if (!UI.popoverMoreMenu.hidden && !UI.btnMoreMenu.contains(e.target) && !UI.popoverMoreMenu.contains(e.target)) {
      closeMoreMenu();
    }
  });

  // Fecha ao clicar em qualquer item dentro do popover
  UI.popoverMoreMenu.querySelectorAll('.popover-item').forEach(item => {
    item.addEventListener('click', () => {
      closeMoreMenu();
    });
  });

  // Botão flutuante de recentralizar (reativa o seguimento na corrida)
  UI.btnRecenter.addEventListener('click', () => {
    isFollowingRunner = true;
    const state = store.getState();
    if (state.userLocation) {
      flyToUserLocation(state.userLocation.lat, state.userLocation.lng, { zoom: 16 });
    } else if (state.startPoint) {
      flyToUserLocation(state.startPoint.lat, state.startPoint.lng, { zoom: 16 });
    } else {
      locator.requestLocation(true);
    }
  });

  // Gestão da tecla Escape global
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!UI.popoverMoreMenu.hidden) {
        closeMoreMenu();
        return;
      }
      if (sheet.getSnap() !== SHEET_SNAPS.HIDDEN) {
        closeRouteSheet(true);
        return;
      }
      if (store.getState().appState === APP_STATES.ESCOLHENDO_PONTOS) {
        exitPickPointsMode();
        return;
      }
      if (store.getState().appState === APP_STATES.DESENHANDO) {
        store.transitionTo(APP_STATES.REPOUSO);
        return;
      }
    }
  });

  // Gesto/botão Voltar do celular (popstate) fecha o painel #rota sem sair do app
  window.addEventListener('popstate', () => {
    if (isInternalHistoryNav) return;
    if (sheet.getSnap() !== SHEET_SNAPS.HIDDEN) {
      sheet.setSnap(SHEET_SNAPS.HIDDEN);
      store.transitionTo(APP_STATES.REPOUSO);
    }
  });
}

/**
 * Conecta ações da barra inferior (Dock)
 */
function setupBottomDock() {
  // Ação 1: Rota Loop (abre/fecha alternando)
  UI.dockBtnLoop.addEventListener('click', () => {
    const currentSnap = sheet.getSnap();
    if (currentSnap === SHEET_SNAPS.HIDDEN) {
      openRouteSheet();
    } else {
      closeRouteSheet(true);
    }
  });

  // Ação 2: Iniciar Corrida como no Strava (direto da posição atual sem exigir rota nem pontos)
  UI.dockBtnStart.addEventListener('click', () => {
    const state = store.getState();
    if (!state.userLocation) {
      UI.showToast('Aguardando sinal do GPS para iniciar…', 3500);
      locator.requestLocation(true);
      return;
    }

    closeRouteSheet(false);
    closeMoreMenu();
    isFollowingRunner = true;
    tracker.startRun(state.userLocation);
  });

  // Ação 3: Modo Desenhar
  UI.dockBtnDraw.addEventListener('click', () => {
    closeRouteSheet(false);
    closeMoreMenu();
    if (store.getState().appState === APP_STATES.ESCOLHENDO_PONTOS) {
      exitPickPointsMode();
    }
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
  // Botão X grande fecha totalmente e volta ao repouso
  UI.btnCloseSheet.addEventListener('click', () => {
    closeRouteSheet(true);
  });

  // Toque no resumo compacto expande o sheet para visualização dos dados completos
  if (UI.sheetCompactSummary) {
    UI.sheetCompactSummary.addEventListener('click', () => {
      sheet.setSnap(SHEET_SNAPS.HALF);
    });
  }

  // Botão Gerar Rota (Loop ou Ponto a Ponto)
  UI.btnGenerateRoute.addEventListener('click', () => {
    currentRotationSeed = Math.floor(Math.random() * 60);
    triggerRouteGeneration();
  });

  // Botão Gerar Outro Traçado
  UI.btnRegenerateRoute.addEventListener('click', () => {
    currentRotationSeed = (currentRotationSeed + 72 + Math.floor(Math.random() * 20)) % 360;
    triggerRouteGeneration();
  });

  // Botão Limpar Rota
  if (UI.btnClearRoute) {
    UI.btnClearRoute.addEventListener('click', () => {
      clearRouteLayers();
      lastGeneratedRoute = null;
      UI.resultCard.hidden = true;
      UI.btnRegenerateRoute.hidden = true;
      UI.btnClearRoute.hidden = true;
      if (UI.pointToPointBanner) UI.pointToPointBanner.hidden = true;
      if (UI.distanceSelectorCard) UI.distanceSelectorCard.hidden = false;
      if (UI.sheetCompactSummary) UI.sheetCompactSummary.hidden = true;
      UI.showToast('Rota removida do mapa.');
      store.setState({ routeData: null });
    });
  }
}

/**
 * Geração de rota (Circuito Loop via loop-generator.js ou Ponto a Ponto via OSRM)
 */
async function triggerRouteGeneration() {
  const state = store.getState();
  const startPoint = getStartPoint() || state.startPoint || state.userLocation;
  const endPoint = getEndPoint() || state.endPoint;

  if (!startPoint) {
    UI.showToast('Aguarde o sinal de GPS ou defina o Início no mapa.', 4000);
    UI.setErrorState('Defina um ponto de partida', 'Aguarde o GPS ou toque em "Escolher pontos" para definir o Início.');
    return;
  }

  // Verifica se há Início e Fim distintos (A -> B)
  let isPointToPoint = false;
  if (endPoint) {
    const distBetween = haversineDistance(startPoint, endPoint);
    if (distBetween < 50) {
      UI.showToast('Início e Fim a menos de 50 m: tratando como circuito loop.', 3500);
    } else {
      isPointToPoint = true;
    }
  }

  cancelActiveRequest();
  const generationId = ++activeGenerationId;
  activeAbortController = new AbortController();

  // 1. Rota Ponto a Ponto (A -> B)
  if (isPointToPoint) {
    store.transitionTo(APP_STATES.GERANDO);
    UI.setLoadingState(true, 'Traçando rota a pé…', 'Consultando malha viária OSRM…', 1, 1);

    try {
      const osrmResult = await fetchRoute([startPoint, endPoint], { signal: activeAbortController.signal });

      if (generationId !== activeGenerationId) return;

      // Verifica snap superior a 200 m
      if (osrmResult.snappedWaypoints && osrmResult.snappedWaypoints.length >= 2) {
        const snapStart = haversineDistance(startPoint, osrmResult.snappedWaypoints[0]);
        const snapEnd = haversineDistance(endPoint, osrmResult.snappedWaypoints[1]);
        if (snapStart > 200 || snapEnd > 200) {
          const maxSnap = Math.round(Math.max(snapStart, snapEnd));
          UI.showToast(`Atenção: o ponto foi ajustado para a rua mais próxima a ${maxSnap} m de distância.`, 6000);
        }
      }

      const route = {
        isPointToPoint: true,
        type: 'point_to_point',
        coordinates: osrmResult.coordinates,
        distanceMeters: osrmResult.distanceMeters,
        durationSeconds: osrmResult.durationSeconds,
        start: startPoint,
        end: endPoint,
        snappedWaypoints: osrmResult.snappedWaypoints
      };

      lastGeneratedRoute = route;
      renderRoute(route);
      UI.populatePointToPointResultCard(route);

      sheet.setSnap(SHEET_SNAPS.COMPACT);
      store.transitionTo(APP_STATES.ROTA_PRONTA, { routeData: route });
    } catch (err) {
      if (generationId !== activeGenerationId) return;

      if (err.name === 'AbortError') {
        UI.setLoadingState(false);
        store.transitionTo(APP_STATES.PLANEJANDO);
        return;
      }

      console.error('Falha na rota ponto a ponto:', err);
      UI.setErrorState('Não foi possível traçar a rota', err.message || 'Verifique se os pontos estão próximos de ruas caminháveis.');
      store.transitionTo(APP_STATES.PLANEJANDO);
    } finally {
      if (generationId === activeGenerationId) {
        activeAbortController = null;
        UI.setLoadingState(false);
      }
    }
    return;
  }

  // 2. Rota Circular (Loop)
  const valResult = UI.validateDistance();
  if (!valResult.isValid) {
    UI.showDistanceError(valResult.errorMsg);
    return;
  }
  UI.showDistanceError(null);

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
 * Conecta o modo Escolher Pontos (Início e Fim)
 */
function setupPickPointsMode() {
  // Botão flutuante para entrar no modo
  UI.btnPickPoints.addEventListener('click', () => {
    if (store.getState().appState === APP_STATES.ESCOLHENDO_PONTOS) {
      exitPickPointsMode();
    } else {
      enterPickPointsMode();
    }
  });

  // Abas Início | Fim
  UI.pickTabStart.addEventListener('click', () => {
    activePickTarget = 'start';
    UI.setChoosePointsMode(true, 'start', hasEndPoint());
  });

  UI.pickTabEnd.addEventListener('click', () => {
    activePickTarget = 'end';
    UI.setChoosePointsMode(true, 'end', hasEndPoint());
  });

  // Botão Usar Minha Posição
  UI.btnPickUseGps.addEventListener('click', () => {
    const userLoc = store.getState().userLocation;
    if (userLoc) {
      setStartPoint(userLoc.lat, userLoc.lng, true);
      store.setState({ startPoint: userLoc });
      UI.setStartCoordsDisplay(userLoc.lat, userLoc.lng);
      UI.showToast('Ponto de partida definido na sua localização atual.');
      if (!hasEndPoint()) {
        activePickTarget = 'end';
        UI.setChoosePointsMode(true, 'end', false);
      }
    } else {
      UI.showToast('Buscando sinal de GPS…');
      locator.requestLocation(true);
    }
  });

  // Botão Remover Fim
  UI.btnPickRemoveEnd.addEventListener('click', () => {
    removeEndPoint();
    store.setState({ endPoint: null });
    UI.setEndCoordsDisplay(null, null);
    UI.setChoosePointsMode(true, activePickTarget, false);
    UI.showToast('Ponto final removido. Rota será do tipo loop.');
  });

  // Botão Concluir
  UI.btnPickFinish.addEventListener('click', () => {
    exitPickPointsMode();
  });

  // Escuta arraste dos marcadores exclusivamente neste modo
  setMarkerDragEndHandler((type, coords) => {
    if (type === 'start') {
      store.setState({ startPoint: coords });
      UI.setStartCoordsDisplay(coords.lat, coords.lng);
    } else {
      store.setState({ endPoint: coords });
      UI.setEndCoordsDisplay(coords.lat, coords.lng);
    }
  });
}

function enterPickPointsMode() {
  closeMoreMenu();
  closeRouteSheet(false);
  activePickTarget = 'start';
  setMarkersDraggable(true);
  store.transitionTo(APP_STATES.ESCOLHENDO_PONTOS);
  UI.setChoosePointsMode(true, activePickTarget, hasEndPoint());
}

function exitPickPointsMode() {
  setMarkersDraggable(false);
  UI.setChoosePointsMode(false);
  store.transitionTo(APP_STATES.REPOUSO);
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
    store.transitionTo(APP_STATES.REPOUSO);
  });
}

/**
 * Interações no mapa livre
 */
function setupMapInteractions() {
  // Clique no mapa: FORA de desenhar ou escolher pontos, NÃO FAZ NADA!
  setMapClickHandler((coords) => {
    const currentState = store.getState().appState;

    if (currentState === APP_STATES.DESENHANDO) {
      addManualPoint(coords.lat, coords.lng);
      return;
    }

    if (currentState === APP_STATES.ESCOLHENDO_PONTOS) {
      if (activePickTarget === 'start') {
        setStartPoint(coords.lat, coords.lng, false);
        store.setState({ startPoint: coords });
        UI.setStartCoordsDisplay(coords.lat, coords.lng);
        if (!hasEndPoint()) {
          activePickTarget = 'end';
          UI.setChoosePointsMode(true, 'end', false);
        }
      } else {
        setEndPoint(coords.lat, coords.lng, false);
        store.setState({ endPoint: coords });
        UI.setEndCoordsDisplay(coords.lat, coords.lng);
        UI.setChoosePointsMode(true, 'end', true);
      }
      return;
    }

    // Em repouso ou planejando: TOQUE NO MAPA NÃO MUDA MAIS O INÍCIO!
  });

  // Pausa seguimento do corredor se o usuário arrastar manualmente o mapa
  setMapDragStartHandler(() => {
    if (store.getState().appState === APP_STATES.CORRENDO) {
      isFollowingRunner = false;
    }
  });
}

/**
 * Assinatura do Store para refletir mudanças globais de estado na UI
 */
function setupStoreSubscription() {
  store.subscribe((state, prevState) => {
    const appState = state.appState;

    // Atualiza estado do botão Iniciar conforme presença da localização
    UI.setStartButtonWaiting(!state.userLocation);

    // Alterna visualização do Dock e Barras Auxiliares
    if (appState === APP_STATES.CORRENDO || appState === APP_STATES.PAUSADO) {
      UI.bottomDock.hidden = true;
      UI.drawModeBar.hidden = true;
      UI.runActiveBar.hidden = false;
      UI.statsCard.hidden = false;
      sheet.setSnap(SHEET_SNAPS.HIDDEN);
      UI.setChoosePointsMode(false);
    } else if (appState === APP_STATES.DESENHANDO) {
      UI.bottomDock.hidden = true;
      UI.runActiveBar.hidden = true;
      UI.statsCard.hidden = true;
      UI.drawModeBar.hidden = false;
      sheet.setSnap(SHEET_SNAPS.HIDDEN);
      UI.setChoosePointsMode(false);
      clearRouteLayers();
      renderManualDraw(getManualPoints());
    } else if (appState === APP_STATES.ESCOLHENDO_PONTOS) {
      UI.bottomDock.hidden = true;
      UI.runActiveBar.hidden = true;
      UI.statsCard.hidden = true;
      UI.drawModeBar.hidden = true;
      sheet.setSnap(SHEET_SNAPS.HIDDEN);
      UI.setChoosePointsMode(true, activePickTarget, hasEndPoint());
    } else {
      UI.bottomDock.hidden = false;
      UI.runActiveBar.hidden = true;
      UI.drawModeBar.hidden = true;
      UI.setChoosePointsMode(false);

      // Restaura stats card se o sheet não estiver ocupando metade ou tela cheia
      UI.statsCard.hidden = (sheet.getSnap() === SHEET_SNAPS.HALF || sheet.getSnap() === SHEET_SNAPS.FULL);
      clearManualLayers();

      // Mantém a rota existente renderizada no mapa
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
