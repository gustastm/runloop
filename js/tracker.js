/**
 * RunLoop — Rastreador de Corrida em Tempo Real
 * 
 * Gerencia a sessão de corrida no navegador:
 * - watchPosition com filtros rigorosos de precisão e velocidade;
 * - Cálculo de distância acumulada, tempo ativo descontando pausas e ritmo médio;
 * - Integração com Screen Wake Lock API e aviso de tela ativa;
 * - Confirmação de beforeunload durante a corrida.
 */

import { CONFIG } from './config.js';
import {
  filterGpsSample,
  formatStopwatch,
  calculateAveragePace,
  calculateTotalMovingTime
} from './geo.js';
import { store, APP_STATES } from './store.js';

export const TRACKER_STATES = {
  PARADO: 'PARADO',
  CORRENDO: 'CORRENDO',
  PAUSADO: 'PAUSADO',
  FINALIZADO: 'FINALIZADO'
};

export class RunTracker {
  /**
   * @param {object} options
   * @param {function({lat: number, lng: number}): void} [options.onPointAccepted]
   * @param {function(object): void} [options.onMetricsUpdate]
   * @param {function(string): void} [options.onWakeLockStatus]
   */
  constructor(options = {}) {
    this.onPointAccepted = options.onPointAccepted || (() => {});
    this.onMetricsUpdate = options.onMetricsUpdate || (() => {});
    this.onWakeLockStatus = options.onWakeLockStatus || (() => {});

    this.state = TRACKER_STATES.PARADO;
    this.watchId = null;
    this.timerId = null;

    this.startTime = null;
    this.samples = []; // Array<{lat, lng, timestamp, accuracy}>
    this.pauses = [];  // Array<{start, end}>
    this.currentPauseStart = null;

    this.totalDistanceMeters = 0;
    this.movingSeconds = 0;
    this.wakeLock = null;

    this._onBeforeUnload = (e) => {
      if (this.state === TRACKER_STATES.CORRENDO || this.state === TRACKER_STATES.PAUSADO) {
        e.preventDefault();
        e.returnValue = 'Você tem uma corrida em andamento. Deseja realmente sair?';
        return e.returnValue;
      }
    };

    this._onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && this.state === TRACKER_STATES.CORRENDO) {
        this._requestWakeLock();
      }
    };
  }

  /**
   * Inicia a corrida
   * @param {{lat: number, lng: number}|null} [initialPosition=null]
   */
  startRun(initialPosition = null) {
    if (this.state === TRACKER_STATES.CORRENDO) return;

    this.state = TRACKER_STATES.CORRENDO;
    this.startTime = Date.now();
    this.samples = [];
    this.pauses = [];
    this.currentPauseStart = null;
    this.totalDistanceMeters = 0;
    this.movingSeconds = 0;

    if (initialPosition) {
      const firstSample = {
        lat: initialPosition.lat,
        lng: initialPosition.lng,
        timestamp: this.startTime,
        accuracy: 10
      };
      this.samples.push(firstSample);
      this.onPointAccepted(firstSample);
    }

    this._startWatchPosition();
    this._startTimer();
    this._requestWakeLock();

    window.addEventListener('beforeunload', this._onBeforeUnload);
    document.addEventListener('visibilitychange', this._onVisibilityChange);

    store.transitionTo(APP_STATES.CORRENDO, {
      runMetrics: this.getMetrics()
    });
  }

  /**
   * Pausa a corrida em andamento
   */
  pauseRun() {
    if (this.state !== TRACKER_STATES.CORRENDO) return;

    this.state = TRACKER_STATES.PAUSADO;
    this.currentPauseStart = Date.now();
    this.pauses.push({ start: this.currentPauseStart, end: null });

    this._stopWatchPosition();

    store.transitionTo(APP_STATES.PAUSADO, {
      runMetrics: this.getMetrics()
    });
  }

  /**
   * Retoma a corrida pausada
   */
  resumeRun() {
    if (this.state !== TRACKER_STATES.PAUSADO) return;

    this.state = TRACKER_STATES.CORRENDO;
    if (this.currentPauseStart) {
      const lastPause = this.pauses[this.pauses.length - 1];
      if (lastPause && lastPause.end === null) {
        lastPause.end = Date.now();
      }
      this.currentPauseStart = null;
    }

    this._startWatchPosition();
    this._requestWakeLock();

    store.transitionTo(APP_STATES.CORRENDO, {
      runMetrics: this.getMetrics()
    });
  }

  /**
   * Finaliza a corrida
   * @returns {object} Métricas finais consolidadas
   */
  stopRun() {
    if (this.state === TRACKER_STATES.PARADO) return this.getMetrics();

    if (this.state === TRACKER_STATES.PAUSADO && this.currentPauseStart) {
      const lastPause = this.pauses[this.pauses.length - 1];
      if (lastPause && lastPause.end === null) {
        lastPause.end = Date.now();
      }
    }

    this.state = TRACKER_STATES.FINALIZADO;
    this._stopWatchPosition();
    this._stopTimer();
    this._releaseWakeLock();

    window.removeEventListener('beforeunload', this._onBeforeUnload);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);

    const finalMetrics = this.getMetrics();
    store.transitionTo(APP_STATES.FINALIZADO, {
      runMetrics: finalMetrics
    });

    return finalMetrics;
  }

  /**
   * Reinicia o rastreador para o estado de repouso
   */
  reset() {
    this.stopRun();
    this.state = TRACKER_STATES.PARADO;
    this.samples = [];
    this.pauses = [];
    this.totalDistanceMeters = 0;
    this.movingSeconds = 0;
    store.transitionTo(APP_STATES.REPOUSO, {
      runMetrics: {
        movingSeconds: 0,
        distanceMeters: 0,
        paceFormatted: '--:--',
        samplesCount: 0
      }
    });
  }

  getMetrics() {
    const timeFormatted = formatStopwatch(this.movingSeconds);
    const paceFormatted = calculateAveragePace(
      this.movingSeconds,
      this.totalDistanceMeters,
      CONFIG.TRACKER.MIN_RUN_DISTANCE_FOR_PACE
    );

    return {
      state: this.state,
      movingSeconds: this.movingSeconds,
      timeFormatted,
      distanceMeters: Math.round(this.totalDistanceMeters),
      distanceKmFormatted: (this.totalDistanceMeters / 1000).toFixed(2),
      paceFormatted,
      samplesCount: this.samples.length,
      coordinates: this.samples.map(s => [s.lat, s.lng])
    };
  }

  _startWatchPosition() {
    if (!('geolocation' in navigator)) return;

    this._stopWatchPosition();
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this._handlePosition(pos),
      (err) => {
        console.warn('[Tracker] Erro temporário de GPS:', err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: CONFIG.TRACKER.WATCH_MAX_AGE_MS,
        timeout: CONFIG.TRACKER.WATCH_TIMEOUT_MS
      }
    );
  }

  _stopWatchPosition() {
    if (this.watchId !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  _handlePosition(pos) {
    if (this.state !== TRACKER_STATES.CORRENDO) return;

    const sample = {
      lat: Number(pos.coords.latitude.toFixed(6)),
      lng: Number(pos.coords.longitude.toFixed(6)),
      timestamp: pos.timestamp || Date.now(),
      accuracy: pos.coords.accuracy
    };

    const prevSample = this.samples.length > 0 ? this.samples[this.samples.length - 1] : null;
    const filter = filterGpsSample(prevSample, sample, {
      maxAccuracyMeters: CONFIG.TRACKER.MAX_ACCURACY_METERS,
      maxSpeedMps: CONFIG.TRACKER.MAX_SPEED_MPS,
      minDisplacementMeters: CONFIG.TRACKER.MIN_DISPLACEMENT_METERS
    });

    if (filter.accepted) {
      this.samples.push(sample);
      this.totalDistanceMeters += filter.distanceMeters;
      this.onPointAccepted(sample);
      this._emitMetrics();
    }
  }

  _startTimer() {
    this._stopTimer();
    this.timerId = setInterval(() => {
      if (this.state === TRACKER_STATES.CORRENDO) {
        this.movingSeconds = calculateTotalMovingTime(
          this.startTime,
          Date.now(),
          this.pauses
        );
        this._emitMetrics();
      }
    }, 1000);
  }

  _stopTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  _emitMetrics() {
    const metrics = this.getMetrics();
    this.onMetricsUpdate(metrics);
    store.setState({ runMetrics: metrics });
  }

  async _requestWakeLock() {
    if (!('wakeLock' in navigator)) {
      this.onWakeLockStatus('UNSUPPORTED');
      return;
    }

    try {
      if (this.wakeLock !== null) {
        await this.wakeLock.release();
      }
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => {
        this.wakeLock = null;
      });
      this.onWakeLockStatus('ACTIVE');
    } catch (err) {
      console.warn('[Tracker] Não foi possível ativar Screen Wake Lock:', err);
      this.onWakeLockStatus('DENIED');
    }
  }

  async _releaseWakeLock() {
    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
      } catch {}
      this.wakeLock = null;
    }
  }
}
