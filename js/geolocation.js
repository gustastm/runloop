/**
 * RunLoop — Módulo de Geolocalização do Navegador
 * 
 * Solicita a posição geográfica do usuário apenas sob demanda (clique no botão),
 * com logging detalhado de diagnóstico e mapeamento estrito dos códigos de erro nativos:
 * 1 = PERMISSION_DENIED
 * 2 = POSITION_UNAVAILABLE
 * 3 = TIMEOUT
 */

/**
 * Erro customizado de geolocalização preservando o código numérico real da API
 */
export class GeolocationError extends Error {
  /**
   * @param {number} code - 1 (PERMISSION_DENIED), 2 (POSITION_UNAVAILABLE), 3 (TIMEOUT), ou 0 (não suportado)
   * @param {string} rawMessage - mensagem original do navegador
   * @param {string} title - título específico para o card de erro
   * @param {string} message - descrição amigável detalhada
   */
  constructor(code, rawMessage, title, message) {
    super(message);
    this.name = 'GeolocationError';
    this.code = code;
    this.rawMessage = rawMessage;
    this.title = title;
  }
}

/**
 * Obtém as coordenadas atuais do usuário via API nativa do navegador
 * 
 * @param {object} [options]
 * @param {number} [options.timeout=15000] - Tempo limite em milissegundos
 * @param {boolean} [options.enableHighAccuracy=false] - Modo de alta precisão (GPS)
 * @param {number} [options.maximumAge=0] - Idade máxima do cache
 * @returns {Promise<{lat: number, lng: number, accuracy: number}>}
 */
export async function getCurrentUserLocation(options = {}) {
  const timestamp = new Date().toISOString();

  // 1. Diagnóstico do ambiente do navegador
  let permissionState = 'não suportado / desconhecido';
  if (navigator.permissions && typeof navigator.permissions.query === 'function') {
    try {
      const perm = await navigator.permissions.query({ name: 'geolocation' });
      permissionState = perm.state; // 'granted' | 'prompt' | 'denied'
    } catch (e) {
      permissionState = `erro na consulta: ${e.message}`;
    }
  }

  const diagContext = {
    timestamp,
    hostname: window.location.hostname || '(vazio)',
    protocol: window.location.protocol,
    isSecureContext: window.isSecureContext,
    hasGeolocation: 'geolocation' in navigator,
    permissionState
  };

  console.groupCollapsed(`[RunLoop GEO] Diagnóstico de Chamada - ${timestamp}`);
  console.log('Ambiente:', diagContext);

  if (!navigator.geolocation) {
    console.error('[RunLoop GEO] navigator.geolocation NÃO suportado neste navegador.');
    console.groupEnd();
    throw new GeolocationError(
      0,
      'navigator.geolocation is undefined',
      'Geolocalização não suportada',
      'Seu navegador não possui suporte à Geolocation API. Por favor, clique diretamente no mapa para definir onde começar.'
    );
  }

  const geoOptions = {
    enableHighAccuracy: options.enableHighAccuracy ?? false,
    timeout: options.timeout ?? 15000,
    maximumAge: options.maximumAge ?? 0
  };

  console.log('Options utilizadas:', geoOptions);
  console.log('Disparando navigator.geolocation.getCurrentPosition()...');
  console.groupEnd();

  return new Promise((resolve, reject) => {
    const startTime = performance.now();

    navigator.geolocation.getCurrentPosition(
      // Callback de Sucesso
      (position) => {
        const durationMs = Math.round(performance.now() - startTime);
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        const accuracy = Math.round(position.coords.accuracy);

        console.log(`[RunLoop GEO SUCESSO] (${durationMs}ms):`, {
          latitude: lat,
          longitude: lng,
          accuracy: `${accuracy}m`,
          timestamp: position.timestamp
        });

        resolve({ lat, lng, accuracy });
      },

      // Callback de Erro com mapeamento estrito
      (error) => {
        const durationMs = Math.round(performance.now() - startTime);

        console.error(`[RunLoop GEO ERRO] (${durationMs}ms):`, {
          code: error.code,
          message: error.message,
          PERMISSION_DENIED: error.PERMISSION_DENIED,
          POSITION_UNAVAILABLE: error.POSITION_UNAVAILABLE,
          TIMEOUT: error.TIMEOUT,
          timestamp: new Date().toISOString()
        });

        let title = '';
        let message = '';

        switch (error.code) {
          case error.PERMISSION_DENIED: // Código 1
            title = 'Permissão de localização negada (código 1)';
            message = `A permissão de localização foi negada no navegador ou no sistema (PERMISSION_DENIED: "${error.message || 'Permissão negada'}"). Você pode clicar diretamente no mapa para definir o ponto de partida.`;
            break;

          case error.POSITION_UNAVAILABLE: // Código 2
            title = 'Localização indisponível (código 2)';
            message = `O sinal ou serviço de localização está indisponível (POSITION_UNAVAILABLE: "${error.message || 'Posição indisponível'}"). Verifique se os serviços de localização do sistema operacional estão ativos ou clique no mapa para escolher o ponto de partida.`;
            break;

          case error.TIMEOUT: // Código 3
            title = 'Tempo de localização esgotado (código 3)';
            message = `Tempo limite esgotado ao buscar sua localização (TIMEOUT: "${error.message || 'Timeout expired'}"). O provedor de localização não respondeu em ${Math.round(geoOptions.timeout / 1000)}s. Clique no mapa para escolher o ponto de partida.`;
            break;

          default:
            title = `Erro de localização (código ${error.code || 'desconhecido'})`;
            message = `Falha ao obter localização ("${error.message || 'Erro desconhecido'}"). Clique diretamente no mapa para definir o ponto de partida.`;
            break;
        }

        reject(new GeolocationError(error.code, error.message, title, message));
      },

      geoOptions
    );
  });
}

/**
 * Função de diagnóstico para teste mínimo e isolado (disponível no console)
 * 
 * @param {object} [customOptions] 
 * @returns {Promise<{ok: boolean, lat?: number, lng?: number, code?: number, message?: string, durationMs: number}>}
 */
export function testIsolatedGeolocation(customOptions = { enableHighAccuracy: false, timeout: 15000, maximumAge: 0 }) {
  console.log('[RunLoop GEO TESTE ISOLADO] Iniciando com options:', customOptions);
  const start = performance.now();

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const durationMs = Math.round(performance.now() - start);
        console.log('GEO SUCCESS', position.coords.latitude, position.coords.longitude, `(precisão: ${position.coords.accuracy}m em ${durationMs}ms)`);
        resolve({
          ok: true,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          durationMs
        });
      },
      (error) => {
        const durationMs = Math.round(performance.now() - start);
        console.error('GEO ERROR', error.code, error.message, `(em ${durationMs}ms)`);
        resolve({
          ok: false,
          code: error.code,
          message: error.message,
          durationMs
        });
      },
      customOptions
    );
  });
}

// Expõe no objeto global window para diagnóstico interativo no DevTools do navegador
if (typeof window !== 'undefined') {
  window.runLoopGeo = {
    getCurrentUserLocation,
    testIsolatedGeolocation
  };
}
