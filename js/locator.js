/**
 * RunLoop — Gerenciador de Localização Automática e GPS
 * 
 * Estratégia resiliente para celulares e desktop:
 * - Consulta antecipada da Permissions API;
 * - 1ª tentativa com alta precisão (enableHighAccuracy: true, timeout: 15s);
 * - Fallback único com baixa precisão (enableHighAccuracy: false, timeout: 15s) em erro 2 ou 3;
 * - Feedback detalhado no chip de status do GPS e avisos não-bloqueantes via toast;
 * - Sem watchPosition em repouso para economizar bateria.
 */

import { CONFIG } from './config.js';
import { store, APP_STATES } from './store.js';

export class LocationManager {
  /**
   * @param {object} options
   * @param {function(object): void} [options.onSuccess]
   * @param {function(string, string): void} [options.onError]
   * @param {function(string): void} [options.onStatusChange]
   */
  constructor(options = {}) {
    this.onSuccess = options.onSuccess || (() => {});
    this.onError = options.onError || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});
    this.isRequesting = false;
  }

  /**
   * Executa a busca de localização automática
   * @param {boolean} [isManualRetry=false]
   */
  async requestLocation(isManualRetry = false) {
    if (this.isRequesting) return;
    if (!('geolocation' in navigator)) {
      this._handleFailure({ code: 0, message: 'Geolocalização não suportada neste navegador.' });
      return;
    }

    this.isRequesting = true;
    this._updateStatus('locating', 'Localizando…');

    // Verifica antecipadamente se a permissão já foi explicitamente negada
    if ('permissions' in navigator && navigator.permissions.query) {
      try {
        const perm = await navigator.permissions.query({ name: 'geolocation' });
        if (perm.state === 'denied') {
          this.isRequesting = false;
          this._updateStatus('denied', 'Sem localização');
          this.onError(
            'Permissão negada',
            'O acesso à localização está bloqueado nas configurações do navegador. Libere a permissão para centralizar no seu ponto.'
          );
          return;
        }
      } catch {}
    }

    try {
      // 1ª Tentativa: Alta precisão
      const pos = await this._getPosition({
        enableHighAccuracy: true,
        timeout: CONFIG.TRACKER.INITIAL_TIMEOUT_MS,
        maximumAge: 0
      });
      this._handleSuccess(pos);
    } catch (firstErr) {
      // Fallback em código 2 (indisponível) ou 3 (timeout)
      if (firstErr.code === 2 || firstErr.code === 3) {
        try {
          const fallbackPos = await this._getPosition({
            enableHighAccuracy: false,
            timeout: CONFIG.TRACKER.INITIAL_TIMEOUT_MS,
            maximumAge: 0
          });
          this._handleSuccess(fallbackPos);
          return;
        } catch (secondErr) {
          this._handleFailure(secondErr);
          return;
        }
      }
      this._handleFailure(firstErr);
    } finally {
      this.isRequesting = false;
    }
  }

  _getPosition(options) {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
  }

  _handleSuccess(position) {
    const lat = Number(position.coords.latitude.toFixed(6));
    const lng = Number(position.coords.longitude.toFixed(6));
    const accuracy = position.coords.accuracy || 10;

    let statusKey = 'ready';
    let statusText = `GPS ±${Math.round(accuracy)} m`;

    if (accuracy > 100) {
      statusKey = 'low_accuracy';
      statusText = `Precisão baixa (±${Math.round(accuracy)} m)`;
    }

    this._updateStatus(statusKey, statusText, accuracy);

    const locationData = { lat, lng, accuracy };
    store.setState({
      userLocation: { lat, lng },
      startPoint: { lat, lng },
      gpsStatus: statusKey,
      gpsAccuracy: accuracy
    });

    if (store.getState().appState === APP_STATES.LOCALIZANDO) {
      store.transitionTo(APP_STATES.REPOUSO);
    }

    this.onSuccess(locationData);
  }

  _handleFailure(error) {
    let title = 'Sem localização';
    let message = 'Não foi possível obter sua posição.';
    let statusKey = 'error';

    if (error.code === 1) {
      statusKey = 'denied';
      title = 'Permissão negada';
      message = 'Você negou a permissão de localização. Toque no mapa para escolher o ponto de partida.';
    } else if (error.code === 2) {
      title = 'GPS indisponível';
      message = 'O provedor de localização do aparelho não respondeu. Toque no mapa para marcar o início.';
    } else if (error.code === 3) {
      title = 'Tempo esgotado';
      message = 'O GPS demorou muito para responder. Tente novamente ou toque no mapa.';
    }

    this._updateStatus(statusKey, 'Sem localização');
    store.setState({ gpsStatus: statusKey });

    if (store.getState().appState === APP_STATES.LOCALIZANDO) {
      store.transitionTo(APP_STATES.REPOUSO);
    }

    this.onError(title, message);
  }

  _updateStatus(statusKey, statusText, accuracy = null) {
    this.onStatusChange(statusText);
    store.setState({
      gpsStatus: statusKey,
      gpsAccuracy: accuracy
    });
  }
}
