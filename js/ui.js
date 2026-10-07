/**
 * RunLoop — Módulo de Manipulação da Interface do Usuário (UI)
 * 
 * Gerencia estados de tela (loading, erro, resultado), validação de formulários,
 * acessibilidade e atualização segura do DOM (evitando innerHTML com dados externos).
 */

import { CONFIG } from './config.js';
import { formatDistance, formatDuration } from './geo.js';

export const UI = {
  // Elementos das Abas e Modos
  tabAuto: document.getElementById('tab-auto-mode'),
  tabDraw: document.getElementById('tab-draw-mode'),
  sectionAuto: document.getElementById('section-auto-mode'),
  sectionDraw: document.getElementById('section-draw-mode'),

  // Ponto de Partida
  startCoordsBadge: document.getElementById('start-coords-badge'),
  btnUseLocation: document.getElementById('btn-use-location'),

  // Campo de Distância e Presets
  inputDistance: document.getElementById('input-distance'),
  btnDistMinus: document.getElementById('btn-dist-minus'),
  btnDistPlus: document.getElementById('btn-dist-plus'),
  distanceErrorMsg: document.getElementById('distance-error-msg'),
  presetChips: document.querySelectorAll('.preset-chip'),

  // Botões de Ação
  btnGenerateRoute: document.getElementById('btn-generate-route'),
  btnGenerateText: document.getElementById('btn-generate-text'),
  btnRegenerateRoute: document.getElementById('btn-regenerate-route'),

  // Cards de Estado
  loadingCard: document.getElementById('loading-state'),
  loadingTitle: document.getElementById('loading-title'),
  loadingStepText: document.getElementById('loading-step-text'),
  progressBarFill: document.getElementById('progress-bar-fill'),

  errorCard: document.getElementById('error-card'),
  errorTitle: document.getElementById('error-title'),
  errorDesc: document.getElementById('error-desc'),

  resultCard: document.getElementById('result-card'),
  toleranceBadge: document.getElementById('tolerance-badge'),
  metricActualDistance: document.getElementById('metric-actual-distance'),
  metricRequestedDistance: document.getElementById('metric-requested-distance'),
  metricDiff: document.getElementById('metric-diff'),
  metricDuration: document.getElementById('metric-duration'),
  metricOverlap: document.getElementById('metric-overlap'),
  routeWarningBanner: document.getElementById('route-warning-banner'),
  routeWarningText: document.getElementById('route-warning-text'),

  // Modo Desenho Manual
  manualPointsBadge: document.getElementById('manual-points-count-badge'),
  manualTotalDistance: document.getElementById('manual-total-distance'),
  btnDrawUndo: document.getElementById('btn-draw-undo'),
  btnDrawClear: document.getElementById('btn-draw-clear'),

  // Live region acessível
  statusLiveRegion: document.getElementById('status-live-region'),

  /**
   * Anuncia mensagem para leitores de tela
   * @param {string} message 
   */
  announce(message) {
    if (this.statusLiveRegion) {
      this.statusLiveRegion.textContent = message;
    }
  },

  /**
   * Atualiza o badge com as coordenadas do ponto de partida
   * @param {number|null} lat 
   * @param {number|null} lng 
   */
  setStartCoordsDisplay(lat, lng) {
    if (this.startCoordsBadge) {
      if (typeof lat === 'number' && typeof lng === 'number') {
        this.startCoordsBadge.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      } else {
        this.startCoordsBadge.textContent = 'Nenhum ponto selecionado';
      }
    }
  },

  /**
   * Valida a distância informada pelo usuário
   * @returns {{isValid: boolean, valueKm: number, errorMsg: string}}
   */
  validateDistance() {
    const rawVal = this.inputDistance.value ? this.inputDistance.value.trim() : '';
    const val = parseFloat(rawVal);

    if (rawVal === '' || isNaN(val)) {
      return {
        isValid: false,
        valueKm: 0,
        errorMsg: 'Por favor, informe um número válido de quilômetros.'
      };
    }

    if (val < CONFIG.MIN_DISTANCE_KM) {
      return {
        isValid: false,
        valueKm: val,
        errorMsg: `A distância mínima para rota de corrida é ${CONFIG.MIN_DISTANCE_KM} km.`
      };
    }

    if (val > CONFIG.MAX_DISTANCE_KM) {
      return {
        isValid: false,
        valueKm: val,
        errorMsg: `A distância máxima permitida no momento é ${CONFIG.MAX_DISTANCE_KM} km (maratona).`
      };
    }

    return {
      isValid: true,
      valueKm: val,
      errorMsg: ''
    };
  },

  /**
   * Exibe ou limpa erro do campo de distância
   * @param {string|null} message 
   */
  showDistanceError(message) {
    if (message) {
      this.distanceErrorMsg.textContent = message;
      this.distanceErrorMsg.hidden = false;
      this.inputDistance.setAttribute('aria-invalid', 'true');
    } else {
      this.distanceErrorMsg.textContent = '';
      this.distanceErrorMsg.hidden = true;
      this.inputDistance.removeAttribute('aria-invalid');
    }
  },

  /**
   * Atualiza a seleção visual dos chips de preset
   * @param {number} kmValue 
   */
  syncPresetChips(kmValue) {
    this.presetChips.forEach(chip => {
      const chipKm = parseFloat(chip.dataset.km);
      if (chipKm === kmValue) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
  },

  /**
   * Alterna entre o modo Automático e Desenho Manual
   * @param {'auto'|'draw'} mode 
   */
  setActiveMode(mode) {
    const isAuto = mode === 'auto';

    this.tabAuto.classList.toggle('active', isAuto);
    this.tabAuto.setAttribute('aria-selected', isAuto ? 'true' : 'false');
    this.sectionAuto.hidden = !isAuto;

    this.tabDraw.classList.toggle('active', !isAuto);
    this.tabDraw.setAttribute('aria-selected', !isAuto ? 'true' : 'false');
    this.sectionDraw.hidden = isAuto;

    this.announce(`Modo alterado para ${isAuto ? 'Rota Circular Automática' : 'Desenho Manual'}`);
  },

  /**
   * Estado atual da aplicação
   */
  currentAppState: 'IDLE',

  /**
   * Define o estado global da interface garantindo exclusão mútua entre cards
   * Estados possíveis: 'IDLE' | 'LOCATING' | 'GENERATING' | 'SUCCESS' | 'ERROR'
   * @param {'IDLE'|'LOCATING'|'GENERATING'|'SUCCESS'|'ERROR'} state 
   * @param {object} [data] 
   */
  setAppState(state, data = {}) {
    this.currentAppState = state;

    switch (state) {
      case 'IDLE':
        this.loadingCard.hidden = true;
        this.errorCard.hidden = true;
        this.btnGenerateRoute.disabled = false;
        this.btnRegenerateRoute.disabled = false;
        this.btnUseLocation.disabled = false;
        this.inputDistance.disabled = false;
        this.btnGenerateText.textContent = 'Gerar rota circular';
        break;

      case 'LOCATING':
        this.loadingCard.hidden = true;
        this.errorCard.hidden = true;
        this.btnGenerateRoute.disabled = true;
        this.btnRegenerateRoute.disabled = true;
        this.btnUseLocation.disabled = true;
        this.inputDistance.disabled = false;
        this.announce('Obtendo sua localização geográfica...');
        break;

      case 'GENERATING':
        this.loadingCard.hidden = false;
        this.errorCard.hidden = true;
        this.resultCard.hidden = true;
        this.btnGenerateRoute.disabled = true;
        this.btnRegenerateRoute.disabled = true;
        this.btnUseLocation.disabled = true;
        this.inputDistance.disabled = true;
        this.btnGenerateText.textContent = 'Gerando...';

        const title = data.title || 'Calculando circuito...';
        const stepText = data.stepText || 'Consultando malha viária...';
        const attempt = data.attempt || 1;
        const maxAttempts = data.maxAttempts || CONFIG.MAX_ATTEMPTS;

        this.loadingTitle.textContent = title;
        this.loadingStepText.textContent = stepText;
        const progressPercent = Math.min(100, Math.round((attempt / maxAttempts) * 100));
        this.progressBarFill.style.width = `${progressPercent}%`;

        this.announce(`${title} ${stepText}`);
        break;

      case 'SUCCESS':
        this.loadingCard.hidden = true;
        this.errorCard.hidden = true;
        this.btnGenerateRoute.disabled = false;
        this.btnRegenerateRoute.disabled = false;
        this.btnUseLocation.disabled = false;
        this.inputDistance.disabled = false;
        this.btnGenerateText.textContent = 'Gerar rota circular';

        if (data && data.tolerance) {
          this._populateResultCard(data);
          this.resultCard.hidden = false;
          this.btnRegenerateRoute.hidden = false;
        }
        break;

      case 'ERROR':
        this.loadingCard.hidden = true;
        this.errorCard.hidden = false;
        this.resultCard.hidden = true;
        this.btnGenerateRoute.disabled = false;
        this.btnRegenerateRoute.disabled = false;
        this.btnUseLocation.disabled = false;
        this.inputDistance.disabled = false;
        this.btnGenerateText.textContent = 'Gerar rota circular';

        this.errorTitle.textContent = data.title || 'Não foi possível traçar a rota';
        this.errorDesc.textContent = data.message || data.description || 'Tente selecionar outro ponto de partida no mapa.';
        this.announce(`Erro: ${this.errorTitle.textContent}. ${this.errorDesc.textContent}`);
        break;
    }
  },

  /**
   * Preenche as métricas do card de resultado
   * @param {object} route 
   */
  _populateResultCard(route) {
    const tol = route.tolerance;

    // Distâncias
    this.metricActualDistance.textContent = formatDistance(route.distanceMeters);
    this.metricRequestedDistance.textContent = `${(route.requestedMeters / 1000).toFixed(2)} km`;

    // Diferença em km e %
    const sign = tol.differenceMeters >= 0 ? '+' : '';
    this.metricDiff.textContent = `${sign}${tol.differenceKm} km (${sign}${tol.diffPercent}%)`;

    // Duração estimada (minutos)
    const minutes = (route.distanceMeters / 1000) * CONFIG.ESTIMATED_PACE_MIN_PER_KM;
    this.metricDuration.textContent = `~${formatDuration(minutes)}`;

    // Trechos repetidos
    if (this.metricOverlap) {
      const overlapPct = route.quality ? Math.round(route.quality.overlapFraction * 100) : 0;
      this.metricOverlap.textContent = `${overlapPct}%`;
    }

    // Badge de tolerância
    if (tol.isWithinTolerance) {
      this.toleranceBadge.className = 'badge badge-success';
      this.toleranceBadge.textContent = `✓ Dentro da tolerância (±${CONFIG.DEFAULT_TOLERANCE_PERCENT}%)`;
    } else {
      this.toleranceBadge.className = 'badge badge-warning';
      this.toleranceBadge.textContent = `⚠ Fora da tolerância (${sign}${tol.diffPercent}%)`;
    }

    // Aviso extra (ex: ruas locais limitadas ou ida/volta)
    if (route.warning) {
      this.routeWarningText.textContent = route.warning;
      this.routeWarningBanner.hidden = false;
    } else {
      this.routeWarningBanner.hidden = true;
    }

    this.announce(`Rota gerada: ${formatDistance(route.distanceMeters)}. ${tol.isWithinTolerance ? 'Dentro da tolerância.' : 'Fora da tolerância.'}`);
  },

  /**
   * Ativa estado de carregamento durante a geração da rota (compatibilidade)
   */
  setLoading(isLoading, title = 'Calculando circuito...', stepText = 'Consultando malha viária...', attempt = 1, maxAttempts = 6) {
    if (isLoading) {
      this.setAppState('GENERATING', { title, stepText, attempt, maxAttempts });
    } else {
      if (this.currentAppState === 'GENERATING') {
        this.setAppState('IDLE');
      }
    }
  },

  /**
   * Exibe mensagem de erro na geração da rota (compatibilidade)
   */
  showError(title, description) {
    this.setAppState('ERROR', { title, message: description });
  },

  /**
   * Oculta o card de erro
   */
  hideError() {
    this.errorCard.hidden = true;
    if (this.currentAppState === 'ERROR') {
      this.currentAppState = 'IDLE';
    }
  },

  /**
   * Renderiza os dados do resultado da rota gerada (compatibilidade)
   */
  showRouteResult(route) {
    this.setAppState('SUCCESS', route);
  },

  /**
   * Atualiza as informações do painel de desenho manual
   * @param {object} param0 
   */
  updateManualStats({ count, totalMeters }) {
    this.manualPointsBadge.textContent = `${count} ${count === 1 ? 'ponto' : 'pontos'}`;
    this.manualTotalDistance.textContent = formatDistance(totalMeters);

    this.btnDrawUndo.disabled = count === 0;
    this.btnDrawClear.disabled = count === 0;
  }
};
