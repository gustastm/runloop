/**
 * RunLoop — Algoritmo de Geração de Rotas Circulares
 * 
 * Gera waypoints intermediários distribuídos em círculo ao redor do ponto de partida,
 * submete ao OSRM e itera proporcionalmente avaliando tolerância de distância,
 * sobreposição de vias (overlapFraction), maior trecho contínuo repetido e retornos em U.
 */

import { CONFIG } from './config.js';
import { destinationPoint, calculateTolerance, computeRouteQuality } from './geo.js';
import { fetchRoute } from './routing.js';

/**
 * Cria uma rota circular a partir de um ponto inicial e distância desejada.
 * 
 * @param {object} params
 * @param {{lat: number, lng: number}} params.startPoint - Coordenadas de início/fim
 * @param {number} params.requestedDistanceKm - Distância desejada em km
 * @param {number} [params.rotationOffset=0] - Rotação inicial em graus para variar o traçado
 * @param {number} [params.tolerancePercent] - Tolerância percentual aceitável
 * @param {AbortSignal} [params.signal] - Sinal para cancelamento
 * @param {function} [params.onProgress] - Callback chamado a cada iteração (attempt, max, info)
 * @returns {Promise<{
 *   id: string,
 *   type: 'auto',
 *   start: {lat: number, lng: number},
 *   coordinates: Array<[number, number]>,
 *   distanceMeters: number,
 *   durationSeconds: number,
 *   requestedMeters: number,
 *   tolerance: object,
 *   waypoints: Array<{lat: number, lng: number, name: string}>,
 *   attemptsCount: number,
 *   quality: {
 *     overlapFraction: number,
 *     longestRepeatedRunMeters: number,
 *     uTurnCount: number,
 *     score: number
 *   },
 *   createdAt: string,
 *   warning?: string
 * }>}
 */
export async function generateLoopRoute({
  startPoint,
  requestedDistanceKm,
  rotationOffset = 0,
  tolerancePercent = CONFIG.DEFAULT_TOLERANCE_PERCENT,
  signal,
  onProgress = () => {}
}) {
  const requestedMeters = requestedDistanceKm * 1000;
  const maxRequests = CONFIG.MAX_TOTAL_REQUESTS ?? 12;
  const waypointsCount = CONFIG.WAYPOINTS_COUNT ?? 6;
  const overlapTarget = CONFIG.OVERLAP_TARGET ?? 0.08;
  const weights = CONFIG.SCORE_WEIGHTS ?? { w1: 2.0, w2: 2.5, w3: 1.0, w4: 0.15 };

  // Raio inicial baseado na circunferência aproximada: C = 2 * PI * R
  // Ruas reais não são retas nem círculos perfeitos, usamos o fator de correção inicial (~0.68)
  let currentRadius = (requestedMeters / (2 * Math.PI)) * CONFIG.INITIAL_CORRECTION_FACTOR;

  // Direção de rotação (horária ou anti-horária alternada)
  let isClockwise = Math.floor(rotationOffset / 60) % 2 === 0 ? 1 : -1;
  let currentBearing = (rotationOffset + Math.floor(Math.random() * 30)) % 360;

  const validCandidates = [];
  let totalRequests = 0;

  while (totalRequests < maxRequests) {
    if (signal?.aborted) {
      const abortError = new Error('Geração cancelada.');
      abortError.name = 'AbortError';
      throw abortError;
    }

    totalRequests++;

    onProgress({
      attempt: totalRequests,
      maxAttempts: maxRequests,
      status: `Tentativa ${totalRequests}/${maxRequests}: traçando circuito (raio ${(currentRadius / 1000).toFixed(2)} km, rumo ${Math.round(currentBearing)}°)...`
    });

    // 1. Gera o centro do círculo deslocado do ponto inicial
    // O ponto de partida fica na borda do círculo, garantindo início e fim suaves
    const centerPoint = destinationPoint(
      startPoint.lat,
      startPoint.lng,
      currentRadius,
      currentBearing
    );

    // O ponto de partida está a 180 graus oposto ao vetor centro -> start
    const startAngleFromCenter = (currentBearing + 180) % 360;

    // 2. Distribui os waypoints intermediários pela circunferência com espaçamento uniforme
    // e pequena variação aleatória por ponto para evitar alinhamento estrito em grelhas
    const queryPoints = [startPoint];
    const stepAngle = 360 / waypointsCount;

    for (let i = 1; i < waypointsCount; i++) {
      const angularJitter = (Math.random() - 0.5) * (stepAngle * 0.25);
      const angle = (startAngleFromCenter + isClockwise * stepAngle * i + angularJitter + 360) % 360;
      const wp = destinationPoint(centerPoint.lat, centerPoint.lng, currentRadius, angle);
      queryPoints.push(wp);
    }

    // Fecha o ciclo voltando ao ponto inicial
    queryPoints.push(startPoint);

    let routeResult;
    try {
      routeResult = await fetchRoute(queryPoints, { signal });
    } catch (err) {
      // Se cancelado pelo usuário, propaga imediatamente
      if (err.name === 'AbortError' || signal?.aborted) {
        throw err;
      }

      // Se der erro pontual (ex: waypoint caiu em obstáculo físico), varia o ângulo e ajusta o raio
      currentBearing = (currentBearing + 45 + Math.floor(Math.random() * 30)) % 360;
      currentRadius *= 0.92;
      await delay(CONFIG.DELAY_BETWEEN_ATTEMPTS_MS);
      continue;
    }

    const actualMeters = routeResult.distanceMeters;
    const tol = calculateTolerance(requestedMeters, actualMeters, tolerancePercent);
    const quality = computeRouteQuality(routeResult.coordinates, startPoint);

    // Pontuação: menor é melhor
    const relDistError = Math.abs(actualMeters - requestedMeters) / requestedMeters;
    const score = (weights.w1 * relDistError) +
                  (weights.w2 * quality.overlapFraction) +
                  (weights.w3 * (quality.longestRepeatedRunMeters / requestedMeters)) +
                  (weights.w4 * quality.uTurnCount);

    quality.score = Number(score.toFixed(4));

    const candidate = {
      result: routeResult,
      tolerance: tol,
      quality,
      score,
      attemptNumber: totalRequests
    };

    validCandidates.push(candidate);

    // Critério de parada antecipada: se a rota estiver dentro da tolerância de distância
    // E com sobreposição menor ou igual ao alvo estrito (padrão 8%)
    if (tol.isWithinTolerance && quality.overlapFraction <= overlapTarget) {
      break;
    }

    // Se ainda restam tentativas, ajusta raio e ângulo para a próxima iteração
    if (totalRequests < maxRequests) {
      const scaleRatio = requestedMeters / actualMeters;
      const clampedRatio = Math.max(0.6, Math.min(1.6, scaleRatio));
      currentRadius *= clampedRatio;

      // Se a rota teve overlap alto, na próxima tentativa mude o ângulo (+40° a +90°) e/ou inverta o sentido
      if (quality.overlapFraction > overlapTarget) {
        const angleShift = 40 + Math.floor(Math.random() * 51); // +40° a +90°
        currentBearing = (currentBearing + angleShift) % 360;
        if (Math.random() < 0.5) {
          isClockwise *= -1;
        }
      } else {
        // Se a sobreposição foi baixa mas precisa convergir distância, aplica rotação suave
        currentBearing = (currentBearing + 20 + Math.floor(Math.random() * 15)) % 360;
      }

      await delay(CONFIG.DELAY_BETWEEN_ATTEMPTS_MS);
    }
  }

  if (validCandidates.length === 0) {
    throw new Error('Não foi possível traçar uma rota válida para este local. Tente outro ponto de partida.');
  }

  // Seleciona a melhor candidata:
  // Se houver candidatas dentro da tolerância, escolhe a de menor score entre elas;
  // Caso contrário, escolhe a de menor score geral.
  const candidatesWithinTol = validCandidates.filter(c => c.tolerance.isWithinTolerance);
  let bestCandidate;

  if (candidatesWithinTol.length > 0) {
    candidatesWithinTol.sort((a, b) => a.score - b.score);
    bestCandidate = candidatesWithinTol[0];
  } else {
    validCandidates.sort((a, b) => a.score - b.score);
    bestCandidate = validCandidates[0];
  }

  const { result, tolerance, quality } = bestCandidate;
  const overlapPct = Math.round(quality.overlapFraction * 100);

  let warning = undefined;
  if (!tolerance.isWithinTolerance) {
    const sign = tolerance.diffPercent > 0 ? '+' : '';
    warning = `A rota mais aproximada ficou em ${tolerance.actualKm} km (${sign}${tolerance.differenceKm} km da meta de ${requestedDistanceKm} km), com ${overlapPct}% de trechos repetidos, pois a malha viária local não permitiu fechar o circuito exato.`;
  } else if (quality.overlapFraction > overlapTarget) {
    warning = `Devido à malha viária local, cerca de ${overlapPct}% da rota compartilha a mesma via na ida e na volta (alvo máximo: ${Math.round(overlapTarget * 100)}%).`;
  }

  return {
    id: `route_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type: 'auto',
    start: { lat: startPoint.lat, lng: startPoint.lng },
    coordinates: result.coordinates,
    distanceMeters: result.distanceMeters,
    durationSeconds: result.durationSeconds,
    requestedMeters,
    tolerance,
    waypoints: result.snappedWaypoints,
    attemptsCount: totalRequests, // número real de requisições feitas
    quality: {
      overlapFraction: quality.overlapFraction,
      longestRepeatedRunMeters: quality.longestRepeatedRunMeters,
      uTurnCount: quality.uTurnCount,
      score: quality.score
    },
    createdAt: new Date().toISOString(),
    warning
  };
}

/**
 * Função utilitária para pausa assíncrona
 * @param {number} ms 
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
