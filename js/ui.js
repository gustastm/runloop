/**
 * RunLoop — Módulo de Manipulação da Interface do Usuário (UI)
 * 
 * Gerencia os componentes flutuantes, cards, bottom sheet, modais, toasts
 * e validação do formulário, sempre usando textContent para máxima segurança.
 */

import { CONFIG } from './config.js';
import { formatDistance, formatDuration } from './geo.js';

export const UI = {
  // Barra Superior e GPS
  topBar: document.querySelector('.top-bar'),
  chipGpsStatus: document.getElementById('chip-gps-status'),
  gpsStatusText: document.getElementById('gps-status-text'),
  btnMoreMenu: document.getElementById('btn-more-menu'),
  popoverMoreMenu: document.getElementById('popover-more-menu'),

  // Botões Flutuantes à Direita
  btnRecenter: document.getElementById('btn-recenter'),
  btnPickPoints: document.getElementById('btn-pick-points'),

  // Barra de Modo Escolher Pontos
  pickPointsBar: document.getElementById('pick-points-bar'),
  pickTabStart: document.getElementById('pick-tab-start'),
  pickTabEnd: document.getElementById('pick-tab-end'),
  pickInstructionText: document.getElementById('pick-instruction-text'),
  btnPickUseGps: document.getElementById('btn-pick-use-gps'),
  btnPickRemoveEnd: document.getElementById('btn-pick-remove-end'),
  btnPickFinish: document.getElementById('btn-pick-finish'),

  // Cartão de Estatísticas (3 colunas)
  statsCard: document.getElementById('stats-card'),
  statTime: document.getElementById('stat-time'),
  statPace: document.getElementById('stat-pace'),
  statDistance: document.getElementById('stat-distance'),

  // Barra de Desenho Manual
  drawModeBar: document.getElementById('draw-mode-bar'),
  drawDistanceValue: document.getElementById('draw-distance-value'),
  btnDrawUndo: document.getElementById('btn-draw-undo'),
  btnDrawClear: document.getElementById('btn-draw-clear'),
  btnDrawFinish: document.getElementById('btn-draw-finish'),

  // Barra de Corrida Ativa
  runActiveBar: document.getElementById('run-active-bar'),
  runWakeLockNotice: document.getElementById('run-wake-lock-notice'),
  btnRunPauseResume: document.getElementById('btn-run-pause-resume'),
  btnRunPauseText: document.getElementById('btn-run-pause-text'),
  btnRunFinish: document.getElementById('btn-run-finish'),

  // Barra Inferior (Dock Flutuante)
  bottomDock: document.getElementById('bottom-dock'),
  dockBtnLoop: document.getElementById('dock-btn-loop'),
  dockBtnStart: document.getElementById('dock-btn-start'),
  startBtnLabel: document.getElementById('start-btn-label'),
  dockBtnDraw: document.getElementById('dock-btn-draw'),

  // Bottom Sheet de Rota Loop
  routeSheet: document.getElementById('route-sheet'),
  sheetHandleZone: document.getElementById('sheet-handle-zone'),
  sheetCompactSummary: document.getElementById('sheet-compact-summary'),
  compactSummaryText: document.getElementById('compact-summary-text'),
  btnCompactExpand: document.getElementById('btn-compact-expand'),
  btnCloseSheet: document.getElementById('btn-close-sheet'),

  // Ponto de Partida, Chegada e Formulário de Distância
  startCoordsBadge: document.getElementById('start-coords-badge'),
  endPointIndicator: document.getElementById('end-point-indicator'),
  endCoordsBadge: document.getElementById('end-coords-badge'),
  pointToPointBanner: document.getElementById('point-to-point-banner'),
  distanceSelectorCard: document.getElementById('distance-selector-card'),
  inputDistance: document.getElementById('input-distance'),
  btnDistMinus: document.getElementById('btn-dist-minus'),
  btnDistPlus: document.getElementById('btn-dist-plus'),
  distanceErrorMsg: document.getElementById('distance-error-msg'),
  presetChips: document.querySelectorAll('.preset-chip'),

  // Ações de Geração de Rota
  btnGenerateRoute: document.getElementById('btn-generate-route'),
  btnGenerateText: document.getElementById('btn-generate-text'),
  btnRegenerateRoute: document.getElementById('btn-regenerate-route'),
  btnClearRoute: document.getElementById('btn-clear-route'),

  // Cards de Estado do Sheet
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

  // Modais
  runSummaryModal: document.getElementById('run-summary-modal'),
  summaryDistance: document.getElementById('summary-distance'),
  summaryTime: document.getElementById('summary-time'),
  summaryPace: document.getElementById('summary-pace'),
  btnCloseSummary: document.getElementById('btn-close-summary'),

  confirmFinishModal: document.getElementById('confirm-finish-modal'),
  btnCancelFinish: document.getElementById('btn-cancel-finish'),
  btnConfirmFinish: document.getElementById('btn-confirm-finish'),

  // Toasts
  toastContainer: document.getElementById('toast-container'),

  /**
   * Exibe toast não-bloqueante na tela
   * @param {string} message 
   * @param {number} [durationMs=4000]
   */
  showToast(message, durationMs = 4000) {
    if (!this.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => {
        if (toast.parentElement) toast.remove();
      }, 350);
    }, durationMs);
  },

  /**
   * Atualiza o chip de GPS na barra superior
   * @param {string} statusKey 
   * @param {string} text 
   */
  setGpsStatus(statusKey, text) {
    if (this.chipGpsStatus) {
      this.chipGpsStatus.dataset.status = statusKey;
    }
    if (this.gpsStatusText) {
      this.gpsStatusText.textContent = text;
    }
  },

  /**
   * Atualiza as estatísticas do cartão principal
   * @param {string} time - ex "12:34"
   * @param {string} pace - ex "5:12"
   * @param {string} distanceKm - ex "2,45"
   */
  updateStats(time = '00:00', pace = '--:--', distanceKm = '0,00') {
    if (this.statTime) this.statTime.textContent = time;
    if (this.statPace) this.statPace.textContent = pace;
    if (this.statDistance) this.statDistance.textContent = distanceKm;
  },

  /**
   * Atualiza a exibição do ponto de partida
   * @param {number|null} lat 
   * @param {number|null} lng 
   */
  setStartCoordsDisplay(lat, lng) {
    if (!this.startCoordsBadge) return;
    if (lat !== null && lng !== null) {
      this.startCoordsBadge.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } else {
      this.startCoordsBadge.textContent = 'Toque no mapa para selecionar';
    }
  },

  /**
   * Atualiza a exibição do ponto de chegada
   * @param {number|null} lat 
   * @param {number|null} lng 
   */
  setEndCoordsDisplay(lat, lng) {
    if (!this.endPointIndicator || !this.endCoordsBadge) return;
    if (lat !== null && lng !== null) {
      this.endCoordsBadge.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      this.endPointIndicator.hidden = false;
    } else {
      this.endPointIndicator.hidden = true;
    }
  },

  /**
   * Atualiza o estado visual do botão Iniciar (Aguardando GPS ou Pronto)
   * @param {boolean} isWaiting 
   */
  setStartButtonWaiting(isWaiting) {
    if (!this.dockBtnStart) return;
    if (isWaiting) {
      this.dockBtnStart.classList.add('waiting-gps');
      if (this.startBtnLabel) this.startBtnLabel.textContent = 'Aguardando GPS…';
    } else {
      this.dockBtnStart.classList.remove('waiting-gps');
      if (this.startBtnLabel) this.startBtnLabel.textContent = 'Iniciar';
    }
  },

  /**
   * Alterna modo Escolher Pontos na interface
   * @param {boolean} isActive 
   * @param {'start'|'end'} [activeTab='start'] 
   * @param {boolean} [hasEndPoint=false] 
   */
  setChoosePointsMode(isActive, activeTab = 'start', hasEndPoint = false) {
    if (this.pickPointsBar) {
      this.pickPointsBar.hidden = !isActive;
    }
    if (this.btnPickPoints) {
      this.btnPickPoints.classList.toggle('active', isActive);
    }
    if (this.topBar) {
      this.topBar.hidden = isActive;
    }
    if (this.pickTabStart && this.pickTabEnd) {
      this.pickTabStart.classList.toggle('active', activeTab === 'start');
      this.pickTabStart.setAttribute('aria-selected', activeTab === 'start' ? 'true' : 'false');
      this.pickTabEnd.classList.toggle('active', activeTab === 'end');
      this.pickTabEnd.setAttribute('aria-selected', activeTab === 'end' ? 'true' : 'false');
    }
    if (this.pickInstructionText) {
      this.pickInstructionText.textContent = activeTab === 'start'
        ? 'Toque no mapa para definir o Início'
        : 'Toque no mapa para definir o Fim';
    }
    if (this.btnPickRemoveEnd) {
      this.btnPickRemoveEnd.disabled = !hasEndPoint;
    }
  },

  /**
   * Popula o cartão de resultado de rota PONTO A PONTO (A → B)
   * @param {object} route 
   */
  populatePointToPointResultCard(route) {
    this.metricActualDistance.textContent = formatDistance(route.distanceMeters);
    this.metricRequestedDistance.textContent = '— (A → B)';
    this.metricDiff.textContent = 'Caminho real';

    const minutes = route.durationSeconds
      ? route.durationSeconds / 60
      : (route.distanceMeters / 1000) * CONFIG.ESTIMATED_PACE_MIN_PER_KM;
    this.metricDuration.textContent = `~${formatDuration(minutes)}`;

    if (this.metricOverlap) {
      this.metricOverlap.textContent = '0%';
    }

    this.toleranceBadge.className = 'badge badge-accent';
    this.toleranceBadge.textContent = '✓ Rota Ponto a Ponto (A → B)';

    this.routeWarningBanner.hidden = true;

    const actualKmFormatted = (route.distanceMeters / 1000).toFixed(2).replace('.', ',');
    if (this.compactSummaryText) {
      this.compactSummaryText.textContent = `${actualKmFormatted} km · Ponto a ponto (A → B) · ~${formatDuration(minutes)}`;
    }

    if (this.pointToPointBanner) {
      this.pointToPointBanner.hidden = false;
    }
    if (this.distanceSelectorCard) {
      this.distanceSelectorCard.hidden = true;
    }

    this.resultCard.hidden = false;
    this.btnRegenerateRoute.hidden = true;
    if (this.btnClearRoute) {
      this.btnClearRoute.hidden = false;
    }
    this.loadingCard.hidden = true;
    this.errorCard.hidden = true;
  },

  /**
   * Popula o cartão de resultado da rota no sheet
   * @param {object} route 
   */
  populateResultCard(route) {
    const tol = route.tolerance;
    const sign = tol.differenceMeters >= 0 ? '+' : '';

    this.metricActualDistance.textContent = formatDistance(route.distanceMeters);
    this.metricRequestedDistance.textContent = `${(route.requestedMeters / 1000).toFixed(2)} km`;
    this.metricDiff.textContent = `${sign}${tol.differenceKm} km (${sign}${tol.diffPercent}%)`;

    const minutes = (route.distanceMeters / 1000) * CONFIG.ESTIMATED_PACE_MIN_PER_KM;
    this.metricDuration.textContent = `~${formatDuration(minutes)}`;

    const overlapPct = route.quality ? Math.round(route.quality.overlapFraction * 100) : 0;
    if (this.metricOverlap) {
      this.metricOverlap.textContent = `${overlapPct}%`;
    }

    if (tol.isWithinTolerance) {
      this.toleranceBadge.className = 'badge badge-success';
      this.toleranceBadge.textContent = `✓ Dentro da tolerância (±${CONFIG.DEFAULT_TOLERANCE_PERCENT}%)`;
    } else {
      this.toleranceBadge.className = 'badge badge-warning';
      this.toleranceBadge.textContent = `⚠ Fora da tolerância (${sign}${tol.diffPercent}%)`;
    }

    if (route.warning) {
      this.routeWarningText.textContent = route.warning;
      this.routeWarningBanner.hidden = false;
    } else {
      this.routeWarningBanner.hidden = true;
    }

    // Atualiza também o resumo compacto
    const actualKmFormatted = (route.distanceMeters / 1000).toFixed(2).replace('.', ',');
    const diffPctFormatted = `${sign}${tol.diffPercent}%`;
    if (this.compactSummaryText) {
      this.compactSummaryText.textContent = `${actualKmFormatted} km · ${diffPctFormatted} · ${overlapPct}% repetido`;
    }

    if (this.pointToPointBanner) {
      this.pointToPointBanner.hidden = true;
    }
    if (this.distanceSelectorCard) {
      this.distanceSelectorCard.hidden = false;
    }

    this.resultCard.hidden = false;
    this.btnRegenerateRoute.hidden = false;
    if (this.btnClearRoute) {
      this.btnClearRoute.hidden = false;
    }
    this.loadingCard.hidden = true;
    this.errorCard.hidden = true;
  },

  /**
   * Valida o campo de distância
   */
  validateDistance() {
    const rawVal = this.inputDistance.value.trim().replace(',', '.');
    const val = parseFloat(rawVal);

    if (isNaN(val) || rawVal === '') {
      return {
        isValid: false,
        valueKm: CONFIG.DEFAULT_DISTANCE_KM,
        errorMsg: 'Por favor, informe um número válido de quilômetros.'
      };
    }

    if (val < CONFIG.MIN_DISTANCE_KM) {
      return {
        isValid: false,
        valueKm: val,
        errorMsg: `A distância mínima é ${CONFIG.MIN_DISTANCE_KM} km.`
      };
    }

    if (val > CONFIG.MAX_DISTANCE_KM) {
      return {
        isValid: false,
        valueKm: val,
        errorMsg: `A distância máxima permitida é ${CONFIG.MAX_DISTANCE_KM} km.`
      };
    }

    return {
      isValid: true,
      valueKm: val,
      errorMsg: ''
    };
  },

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



  setLoadingState(isLoading, title = 'Calculando circuito…', stepText = 'Consultando malha viária…', attempt = 1, maxAttempts = 6) {
    if (isLoading) {
      this.loadingCard.hidden = false;
      this.errorCard.hidden = true;
      this.resultCard.hidden = true;
      this.btnGenerateRoute.disabled = true;
      this.btnRegenerateRoute.disabled = true;
      this.inputDistance.disabled = true;
      this.btnGenerateText.textContent = 'Gerando…';

      this.loadingTitle.textContent = title;
      this.loadingStepText.textContent = stepText;
      const progressPercent = Math.min(100, Math.round((attempt / maxAttempts) * 100));
      this.progressBarFill.style.width = `${progressPercent}%`;
    } else {
      this.loadingCard.hidden = true;
      this.btnGenerateRoute.disabled = false;
      this.btnRegenerateRoute.disabled = false;
      this.inputDistance.disabled = false;
      this.btnGenerateText.textContent = 'Gerar rota loop';
    }
  },

  setErrorState(title, description) {
    this.loadingCard.hidden = true;
    this.resultCard.hidden = true;
    this.errorCard.hidden = false;
    this.btnGenerateRoute.disabled = false;
    this.btnRegenerateRoute.disabled = false;
    this.inputDistance.disabled = false;
    this.btnGenerateText.textContent = 'Gerar rota loop';

    this.errorTitle.textContent = title || 'Não foi possível traçar a rota';
    this.errorDesc.textContent = description || 'Tente selecionar outro ponto de partida no mapa.';
  }
};
