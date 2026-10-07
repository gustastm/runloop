/**
 * RunLoop — Cliente de Roteamento OSRM
 * 
 * Comunicação direta com a API pública OSRM (OpenStreetMap routed-foot),
 * com suporte a timeout, cancelamento por AbortController e tratamento de erros.
 */

import { CONFIG } from './config.js';

/**
 * Erro customizado para falhas de roteamento
 */
export class RoutingError extends Error {
  /**
   * @param {string} message 
   * @param {string} [code] 
   */
  constructor(message, code = 'ROUTING_ERROR') {
    super(message);
    this.name = 'RoutingError';
    this.code = code;
  }
}

/**
 * Faz requisição de rota ao serviço OSRM
 * 
 * @param {Array<{lat: number, lng: number}|[number, number]>} points - Lista de pontos ordenados
 * @param {object} [options]
 * @param {AbortSignal} [options.signal] - Sinal para cancelamento manual
 * @param {number} [options.timeoutMs] - Tempo limite em milissegundos
 * @param {string} [options.endpoint] - Endpoint customizado (opcional)
 * @returns {Promise<{
 *   coordinates: Array<[number, number]>, // [[lat, lng], ...]
 *   distanceMeters: number,
 *   durationSeconds: number,
 *   snappedWaypoints: Array<{lat: number, lng: number, name: string}>
 * }>}
 */
export async function fetchRoute(points, options = {}) {
  if (!Array.isArray(points) || points.length < 2) {
    throw new RoutingError('É necessário fornecer pelo menos 2 pontos para traçar a rota.', 'INVALID_POINTS');
  }

  if (options.signal?.aborted) {
    const err = new Error('Operação cancelada pelo usuário.');
    err.name = 'AbortError';
    throw err;
  }

  const endpoint = options.endpoint || CONFIG.ROUTING_ENDPOINT;
  const timeoutMs = options.timeoutMs || CONFIG.REQUEST_TIMEOUT_MS;

  // Formata os pontos para o padrão OSRM: lon,lat;lon,lat;...
  const coordString = points.map(pt => {
    const lat = Array.isArray(pt) ? pt[0] : pt.lat;
    const lng = Array.isArray(pt) ? pt[1] : pt.lng;
    return `${Number(lng).toFixed(6)},${Number(lat).toFixed(6)}`;
  }).join(';');

  // Função interna para executar a chamada em um endpoint específico
  async function executeRequest(targetEndpoint) {
    const url = `${targetEndpoint}/${coordString}?overview=full&geometries=geojson&steps=false`;

    const abortController = new AbortController();
    let isTimedOut = false;

    const timeoutId = setTimeout(() => {
      isTimedOut = true;
      abortController.abort();
    }, timeoutMs);

    let abortListener = null;
    if (options.signal) {
      abortListener = () => {
        clearTimeout(timeoutId);
        abortController.abort();
      };
      options.signal.addEventListener('abort', abortListener, { once: true });
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        signal: abortController.signal
      });

      clearTimeout(timeoutId);
      if (options.signal && abortListener) {
        options.signal.removeEventListener('abort', abortListener);
      }

      if (!response.ok) {
        if (response.status === 429) {
          throw new RoutingError('Muitas requisições ao servidor de mapas. Aguarde alguns instantes.', 'RATE_LIMITED');
        }
        if (response.status >= 500) {
          throw new RoutingError('Servidor de roteamento temporariamente instável. Tente novamente.', 'SERVER_ERROR');
        }
        throw new RoutingError(`Erro na consulta de rota (HTTP ${response.status}).`, 'HTTP_ERROR');
      }

      const data = await response.json();

      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        if (data.code === 'NoRoute') {
          throw new RoutingError('Não foi possível encontrar um caminho a pé conectando os pontos selecionados.', 'NO_ROUTE');
        }
        if (data.code === 'NoSegment') {
          throw new RoutingError('Ponto selecionado não possui ruas ou calçadas roteáveis nas proximidades.', 'NO_SEGMENT');
        }
        throw new RoutingError(data.message || 'Não foi possível traçar rota para este trajeto.', 'OSRM_ERROR');
      }

      const route = data.routes[0];

      // O GeoJSON do OSRM retorna coordenadas como [lon, lat]. Invertemos para [lat, lng] padrão Leaflet.
      const coordinates = (route.geometry?.coordinates || []).map(coord => [coord[1], coord[0]]);

      const snappedWaypoints = (data.waypoints || []).map(wp => ({
        lat: wp.location[1],
        lng: wp.location[0],
        name: wp.name || ''
      }));

      return {
        coordinates,
        distanceMeters: route.distance,
        durationSeconds: route.duration,
        snappedWaypoints
      };
    } catch (err) {
      clearTimeout(timeoutId);
      if (options.signal && abortListener) {
        options.signal.removeEventListener('abort', abortListener);
      }

      // Propaga cancelamento explícito do usuário sem mascarar
      if (options.signal?.aborted) {
        const abortErr = new Error('Operação cancelada pelo usuário.');
        abortErr.name = 'AbortError';
        throw abortErr;
      }

      if (isTimedOut) {
        throw new RoutingError(`Tempo limite de ${Math.round(timeoutMs / 1000)}s excedido ao buscar rota.`, 'TIMEOUT');
      }

      if (err instanceof RoutingError) {
        throw err;
      }

      // Erros de rede (offline, DNS, CORS)
      throw new RoutingError('Falha de conexão com o serviço de mapas. Verifique sua conexão com a internet.', 'NETWORK_ERROR');
    }
  }

  try {
    return await executeRequest(endpoint);
  } catch (err) {
    // Se o endpoint primário falhar por erro de servidor/rede e houver fallback configurado, tenta o fallback
    const isRecoverableError = err.code === 'SERVER_ERROR' || err.code === 'RATE_LIMITED' || err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT';
    const hasFallback = CONFIG.ROUTING_FALLBACK_ENDPOINT && endpoint !== CONFIG.ROUTING_FALLBACK_ENDPOINT;

    if (isRecoverableError && hasFallback && !options.signal?.aborted) {
      console.warn(`[RunLoop] Endpoint principal falhou (${err.message}). Tentando fallback: ${CONFIG.ROUTING_FALLBACK_ENDPOINT}`);
      return await executeRequest(CONFIG.ROUTING_FALLBACK_ENDPOINT);
    }

    throw err;
  }
}
