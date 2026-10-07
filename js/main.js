/**
 * RunLoop — Ponto de Entrada Principal da Aplicação
 * 
 * Conecta os módulos de UI, mapa, geolocalização, algoritmo de loop e desenho manual.
 */

import { CONFIG } from './config.js';
import {
  initMap,
  setStartPoint,
  getStartPoint,
  setMapClickHandler,
  renderRoute,
  renderManualDraw,
  clearRouteLayers,
  clearManualLayers,
  clearAllRoutes,
  setCenter
} from './map.js';
import { getCurrentUserLocation } from './geolocation.js';
import { generateLoopRoute } from './loop-generator.js';
import {
  addManualPoint,
  undoManualPoint,
  clearManualPoints,
  onDrawChange,
  getManualPoints
} from './draw-mode.js';
import { UI } from './ui.js';

let currentMode = 'auto'; // 'auto' | 'draw'
let activeAbortController = null;
let activeGenerationId = 0;
let currentRotationSeed = 0;
let lastGeneratedRoute = null;

/**
 * Inicialização ao carregar a página
 */
function init() {
  // 1. Inicializa o mapa com visão neutra (SEM ponto de partida e SEM marcador assumido)
  initMap('map', CONFIG.DEFAULT_MAP_VIEW);
  UI.setStartCoordsDisplay(null, null);
  UI.setAppState('IDLE');

  // 2. Configura os ouvintes de eventos da UI
  setupModeSwitching();
  setupDistanceInput();
  setupLocationButton();
  setupRouteGeneration();
  setupManualDrawing();
  setupMapInteractions();

  console.log('RunLoop inicializado com sucesso.');
}

/**
 * Alternância entre abas de modo (Automático vs Manual)
 */
function setupModeSwitching() {
  UI.tabAuto.addEventListener('click', () => {
    if (currentMode === 'auto') return;
    currentMode = 'auto';
    UI.setActiveMode('auto');

    // Limpa camadas manuais e restaura rota automática se existia
    clearManualLayers();
    if (lastGeneratedRoute) {
      renderRoute(lastGeneratedRoute);
    }
  });

  UI.tabDraw.addEventListener('click', () => {
    if (currentMode === 'draw') return;
    currentMode = 'draw';
    UI.setActiveMode('draw');

    // Cancela geração em andamento
    cancelActiveRequest();

    // Limpa rota automática e exibe desenho manual
    clearRouteLayers();
    renderManualDraw(getManualPoints());
  });
}

/**
 * Configura campo de distância, botões de incremento/decremento e presets
 */
function setupDistanceInput() {
  const input = UI.inputDistance;

  // Validação ao digitar e sair do campo
  input.addEventListener('input', () => {
    const val = parseFloat(input.value);
    if (!isNaN(val)) {
      UI.syncPresetChips(val);
      UI.showDistanceError(null);
    }
  });

  input.addEventListener('blur', () => {
    const res = UI.validateDistance();
    if (!res.isValid) {
      UI.showDistanceError(res.errorMsg);
    } else {
      UI.showDistanceError(null);
    }
  });

  // Botões de Stepper
  UI.btnDistMinus.addEventListener('click', () => {
    let val = parseFloat(input.value) || CONFIG.DEFAULT_DISTANCE_KM;
    val = Math.max(CONFIG.MIN_DISTANCE_KM, val - 1);
    input.value = val;
    UI.syncPresetChips(val);
    UI.showDistanceError(null);
  });

  UI.btnDistPlus.addEventListener('click', () => {
    let val = parseFloat(input.value) || CONFIG.DEFAULT_DISTANCE_KM;
    val = Math.min(CONFIG.MAX_DISTANCE_KM, val + 1);
    input.value = val;
    UI.syncPresetChips(val);
    UI.showDistanceError(null);
  });

  // Presets rápidos (3k, 5k, 10k, etc.)
  UI.presetChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const km = parseFloat(chip.dataset.km);
      if (!isNaN(km)) {
        input.value = km;
        UI.syncPresetChips(km);
        UI.showDistanceError(null);
      }
    });
  });
}

/**
 * Botão "Usar minha localização"
 */
function setupLocationButton() {
  UI.btnUseLocation.addEventListener('click', async () => {
    cancelActiveRequest();
    UI.setAppState('LOCATING');

    try {
      let pos;
      try {
        // 1ª tentativa: alta precisão com timeout de 20s
        pos = await getCurrentUserLocation({
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0
        });
      } catch (firstErr) {
        // Se falhar com código 2 (POSITION_UNAVAILABLE) ou 3 (TIMEOUT), tenta UMA vez com enableHighAccuracy: false
        if (firstErr.code === 2 || firstErr.code === 3) {
          console.warn(`[RunLoop GEO] Falha na 1ª tentativa com alta precisão (código ${firstErr.code}). Tentando fallback com enableHighAccuracy: false...`);
          pos = await getCurrentUserLocation({
            enableHighAccuracy: false,
            timeout: 20000,
            maximumAge: 0
          });
        } else {
          throw firstErr;
        }
      }

      setStartPoint(pos.lat, pos.lng, true);
      UI.setStartCoordsDisplay(pos.lat, pos.lng);
      UI.setAppState('IDLE');

      // Se havia rota anterior, podemos limpá-la para nova geração
      if (lastGeneratedRoute) {
        clearRouteLayers();
        lastGeneratedRoute = null;
        UI.resultCard.hidden = true;
        UI.btnRegenerateRoute.hidden = true;
      }
    } catch (err) {
      UI.setAppState('ERROR', {
        title: err.title || 'Localização não disponível',
        message: err.message
      });
    }
  });
}

/**
 * Interações no mapa (cliques e reposicionamento)
 */
function setupMapInteractions() {
  setMapClickHandler((coords) => {
    if (currentMode === 'auto') {
      // Define ou substitui ponto de partida
      setStartPoint(coords.lat, coords.lng, false);
      UI.setStartCoordsDisplay(coords.lat, coords.lng);

      // Se estava exibindo erro (ex: tentou gerar sem definir ponto), limpa
      if (UI.currentAppState === 'ERROR') {
        UI.setAppState('IDLE');
      }

      // Se já havia rota gerada, limpa para incentivar nova geração
      if (lastGeneratedRoute) {
        clearRouteLayers();
        lastGeneratedRoute = null;
        UI.resultCard.hidden = true;
        UI.btnRegenerateRoute.hidden = true;
      }
    } else if (currentMode === 'draw') {
      // Adiciona ponto manual
      addManualPoint(coords.lat, coords.lng);
    }
  });
}

/**
 * Configuração dos botões de geração de rota circular
 */
function setupRouteGeneration() {
  // Botão "Gerar rota circular"
  UI.btnGenerateRoute.addEventListener('click', () => {
    currentRotationSeed = Math.floor(Math.random() * 60);
    triggerRouteGeneration();
  });

  // Botão "Gerar outro traçado" (varia o ângulo do circuito)
  UI.btnRegenerateRoute.addEventListener('click', () => {
    currentRotationSeed = (currentRotationSeed + 72 + Math.floor(Math.random() * 20)) % 360;
    triggerRouteGeneration();
  });
}

/**
 * Dispara o processo de geração da rota circular com o algoritmo iterativo
 */
async function triggerRouteGeneration() {
  // TESTE 8 — SEM PONTO: Tente gerar uma rota sem definir ponto.
  // O aplicativo deve impedir a geração e informar claramente: "Defina um ponto de partida."
  const startPoint = getStartPoint();
  if (!startPoint) {
    UI.setAppState('ERROR', {
      title: 'Defina um ponto de partida.',
      message: 'Clique em "Usar minha localização" ou clique em qualquer rua no mapa para escolher onde começar.'
    });
    return;
  }

  const valResult = UI.validateDistance();
  if (!valResult.isValid) {
    UI.showDistanceError(valResult.errorMsg);
    return;
  }
  UI.showDistanceError(null);

  // Cancela requisições anteriores
  cancelActiveRequest();
  const generationId = ++activeGenerationId;
  activeAbortController = new AbortController();

  const requestedKm = valResult.valueKm;

  UI.setAppState('GENERATING', {
    title: 'Planejando circuito...',
    stepText: 'Iniciando primeira iteração...',
    attempt: 1,
    maxAttempts: CONFIG.MAX_ATTEMPTS
  });

  try {
    const route = await generateLoopRoute({
      startPoint,
      requestedDistanceKm: requestedKm,
      rotationOffset: currentRotationSeed,
      tolerancePercent: CONFIG.DEFAULT_TOLERANCE_PERCENT,
      signal: activeAbortController.signal,
      onProgress: ({ attempt, maxAttempts, status }) => {
        if (generationId === activeGenerationId) {
          UI.setAppState('GENERATING', {
            title: 'Ajustando traçado...',
            stepText: status,
            attempt,
            maxAttempts
          });
        }
      }
    });

    if (generationId === activeGenerationId) {
      lastGeneratedRoute = route;
      renderRoute(route);
      UI.setAppState('SUCCESS', route);
    }
  } catch (err) {
    if (generationId !== activeGenerationId) {
      return;
    }

    if (err.name === 'AbortError') {
      console.log('Operação cancelada pelo usuário.');
      UI.setAppState('IDLE');
      return;
    }

    console.error('Falha na geração de rota:', err);
    UI.setAppState('ERROR', {
      title: 'Não foi possível traçar a rota',
      message: err.message || 'Tente selecionar outro ponto de partida no mapa.'
    });
  } finally {
    if (generationId === activeGenerationId) {
      activeAbortController = null;
    }
  }
}

/**
 * Configura ações do modo desenho manual
 */
function setupManualDrawing() {
  // Notificação de mudanças na rota manual
  onDrawChange(({ points, totalMeters, count }) => {
    renderManualDraw(points);
    UI.updateManualStats({ count, totalMeters });
  });

  // Botão Desfazer
  UI.btnDrawUndo.addEventListener('click', () => {
    undoManualPoint();
  });

  // Botão Limpar
  UI.btnDrawClear.addEventListener('click', () => {
    clearManualPoints();
    clearManualLayers();
  });
}

/**
 * Cancela requisição de rota em andamento
 */
function cancelActiveRequest() {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
}

// Inicializa quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

if (typeof window !== 'undefined') {
  window.runLoopUI = UI;
}
