/**
 * RunLoop — Store Reativo Centralizado de Estado
 * 
 * Gerencia a máquina de estados única da aplicação e emite notificações
 * para todos os ouvintes inscritos.
 */

export const APP_STATES = {
  LOCALIZANDO: 'localizando',
  REPOUSO: 'repouso',
  PLANEJANDO: 'planejando',
  GERANDO: 'gerando',
  ROTA_PRONTA: 'rotaPronta',
  DESENHANDO: 'desenhando',
  CORRENDO: 'correndo',
  PAUSADO: 'pausado',
  FINALIZADO: 'finalizado'
};

// Matriz de transições permitidas para garantir consistência
const VALID_TRANSITIONS = {
  [APP_STATES.LOCALIZANDO]: [
    APP_STATES.REPOUSO,
    APP_STATES.PLANEJANDO,
    APP_STATES.DESENHANDO,
    APP_STATES.ROTA_PRONTA
  ],
  [APP_STATES.REPOUSO]: [
    APP_STATES.LOCALIZANDO,
    APP_STATES.PLANEJANDO,
    APP_STATES.DESENHANDO,
    APP_STATES.CORRENDO,
    APP_STATES.ROTA_PRONTA
  ],
  [APP_STATES.PLANEJANDO]: [
    APP_STATES.GERANDO,
    APP_STATES.REPOUSO,
    APP_STATES.DESENHANDO,
    APP_STATES.CORRENDO,
    APP_STATES.LOCALIZANDO,
    APP_STATES.ROTA_PRONTA
  ],
  [APP_STATES.GERANDO]: [
    APP_STATES.ROTA_PRONTA,
    APP_STATES.PLANEJANDO,
    APP_STATES.REPOUSO
  ],
  [APP_STATES.ROTA_PRONTA]: [
    APP_STATES.PLANEJANDO,
    APP_STATES.GERANDO,
    APP_STATES.REPOUSO,
    APP_STATES.DESENHANDO,
    APP_STATES.CORRENDO,
    APP_STATES.LOCALIZANDO
  ],
  [APP_STATES.DESENHANDO]: [
    APP_STATES.REPOUSO,
    APP_STATES.PLANEJANDO,
    APP_STATES.CORRENDO,
    APP_STATES.LOCALIZANDO
  ],
  [APP_STATES.CORRENDO]: [
    APP_STATES.PAUSADO,
    APP_STATES.FINALIZADO
  ],
  [APP_STATES.PAUSADO]: [
    APP_STATES.CORRENDO,
    APP_STATES.FINALIZADO
  ],
  [APP_STATES.FINALIZADO]: [
    APP_STATES.REPOUSO,
    APP_STATES.PLANEJANDO
  ]
};

const initialState = {
  appState: APP_STATES.LOCALIZANDO,
  gpsStatus: 'locating', // 'locating' | 'ready' | 'low_accuracy' | 'error' | 'denied'
  gpsAccuracy: null,
  userLocation: null,    // { lat, lng }
  startPoint: null,      // { lat, lng }
  targetKm: 5,
  routeData: null,
  drawPoints: [],
  drawDistanceMeters: 0,
  runMetrics: {
    movingSeconds: 0,
    distanceMeters: 0,
    paceFormatted: '--:--',
    samplesCount: 0
  },
  activeGeneration: null
};

class Store {
  constructor() {
    this._state = { ...initialState };
    this._listeners = new Set();
  }

  getState() {
    return this._state;
  }

  /**
   * Transiciona para um novo estado com validação rigorosa
   * @param {string} nextState 
   * @param {object} [payload={}] 
   */
  transitionTo(nextState, payload = {}) {
    const currentState = this._state.appState;
    if (currentState === nextState) {
      this.setState(payload);
      return;
    }

    const allowed = VALID_TRANSITIONS[currentState] || [];
    if (!allowed.includes(nextState)) {
      console.warn(`[Store] Transição inválida: ${currentState} -> ${nextState}. Forçando atualização de dados.`);
    }

    this._state = {
      ...this._state,
      ...payload,
      appState: nextState
    };
    this._notify(currentState);
  }

  /**
   * Atualiza propriedades pontuais sem trocar o estado principal
   * @param {object} partial 
   */
  setState(partial) {
    this._state = {
      ...this._state,
      ...partial
    };
    this._notify(this._state.appState);
  }

  /**
   * Inscreve um observador que recebe o novo estado e o estado anterior
   * @param {function(object, string): void} listener 
   * @returns {function(): void} função de cancelamento
   */
  subscribe(listener) {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  _notify(previousState) {
    for (const listener of this._listeners) {
      try {
        listener(this._state, previousState);
      } catch (err) {
        console.error('[Store] Erro no listener:', err);
      }
    }
  }
}

export const store = new Store();
