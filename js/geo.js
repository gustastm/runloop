/**
 * RunLoop — Módulo de cálculos geográficos e funções puras
 * 
 * Todas as funções são puras, sem efeitos colaterais e independentes de DOM ou Leaflet.
 */

const EARTH_RADIUS_METERS = 6371000;

/**
 * Converte graus para radianos
 * @param {number} deg
 * @returns {number}
 */
export function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Converte radianos para graus
 * @param {number} rad
 * @returns {number}
 */
export function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

/**
 * Calcula a distância ortodrômica entre dois pontos usando a fórmula de Haversine
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distância em metros
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Calcula o ponto de destino dado um ponto inicial, distância e rumo (bearing)
 * @param {number} lat - Latitude inicial em graus decimais
 * @param {number} lon - Longitude inicial em graus decimais
 * @param {number} distanceMeters - Distância a percorrer em metros
 * @param {number} bearingDegrees - Rumo em graus (0 = Norte, 90 = Leste, 180 = Sul, 270 = Oeste)
 * @returns {{lat: number, lng: number}}
 */
export function destinationPoint(lat, lon, distanceMeters, bearingDegrees) {
  const delta = distanceMeters / EARTH_RADIUS_METERS;
  const theta = toRad(bearingDegrees);

  const phi1 = toRad(lat);
  const lambda1 = toRad(lon);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const sinDelta = Math.sin(delta);
  const cosDelta = Math.cos(delta);

  const phi2 = Math.asin(
    sinPhi1 * cosDelta + cosPhi1 * sinDelta * Math.cos(theta)
  );

  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * sinDelta * cosPhi1,
      cosDelta - sinPhi1 * Math.sin(phi2)
    );

  // Normaliza a longitude para [-180, +180]
  const normalizedLon = ((toDeg(lambda2) + 540) % 360) - 180;

  return {
    lat: Number(toDeg(phi2).toFixed(6)),
    lng: Number(normalizedLon.toFixed(6))
  };
}

/**
 * Calcula o comprimento total de uma sequência de coordenadas
 * @param {Array<[number, number]>} coordinates - Array de pares [lat, lng]
 * @returns {number} Distância total em metros
 */
export function calculatePolylineDistance(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return 0;
  }

  let totalMeters = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const [lat1, lon1] = coordinates[i];
    const [lat2, lon2] = coordinates[i + 1];
    totalMeters += haversineDistance(lat1, lon1, lat2, lon2);
  }

  return totalMeters;
}

/**
 * Formata uma distância em metros para string legível
 * @param {number} meters
 * @returns {string} ex: "5.24 km" ou "650 m"
 */
export function formatDistance(meters) {
  if (typeof meters !== 'number' || isNaN(meters) || meters < 0) {
    return '0.00 km';
  }

  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }

  const km = meters / 1000;
  return `${km.toFixed(2)} km`;
}

/**
 * Formata um tempo em minutos para formato amigável (ex: "28 min" ou "1h 15 min")
 * @param {number} totalMinutes
 * @returns {string}
 */
export function formatDuration(totalMinutes) {
  if (!totalMinutes || totalMinutes <= 0) return '0 min';

  const mins = Math.round(totalMinutes);
  if (mins < 60) {
    return `${mins} min`;
  }

  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return remainingMins > 0 ? `${hours}h ${remainingMins} min` : `${hours}h`;
}

/**
 * Analisa a aderência da distância real em relação à distância pedida
 * @param {number} requestedMeters - Distância pedida em metros
 * @param {number} actualMeters - Distância real calculada em metros
 * @param {number} [tolerancePercent=10] - Margem tolerada em porcentagem (padrão 10%)
 * @returns {{
 *   requestedKm: number,
 *   actualKm: number,
 *   differenceKm: number,
 *   diffPercent: number,
 *   isWithinTolerance: boolean,
 *   differenceMeters: number
 * }}
 */
export function calculateTolerance(requestedMeters, actualMeters, tolerancePercent = 10) {
  const req = Math.max(requestedMeters, 1);
  const diffMeters = actualMeters - req;
  const diffPercent = (Math.abs(diffMeters) / req) * 100;
  const isWithinTolerance = diffPercent <= tolerancePercent;

  return {
    requestedKm: Number((req / 1000).toFixed(2)),
    actualKm: Number((actualMeters / 1000).toFixed(2)),
    differenceKm: Number((diffMeters / 1000).toFixed(2)),
    diffPercent: Number(diffPercent.toFixed(1)),
    isWithinTolerance,
    differenceMeters: Math.round(diffMeters)
  };
}

/**
 * Avalia a qualidade do circuito calculando sobreposição, maior trecho repetido e retornos em U.
 * 
 * @param {Array<[number, number]>} coordinates - Array de pares [lat, lng]
 * @param {{lat: number, lng: number}} [startPoint] - Ponto de referência de início/fim
 * @returns {{
 *   overlapFraction: number,
 *   longestRepeatedRunMeters: number,
 *   uTurnCount: number,
 *   totalMeters: number
 * }}
 */
export function computeRouteQuality(coordinates, startPoint) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return {
      overlapFraction: 0,
      longestRepeatedRunMeters: 0,
      uTurnCount: 0,
      totalMeters: 0
    };
  }

  const refLat = startPoint?.lat ?? coordinates[0][0];
  const refLng = startPoint?.lng ?? coordinates[0][1];
  const refLatRad = (refLat * Math.PI) / 180;
  const kx = EARTH_RADIUS_METERS * Math.cos(refLatRad) * (Math.PI / 180);
  const ky = EARTH_RADIUS_METERS * (Math.PI / 180);

  // Projeta coordenadas para plano local equirretangular (metros)
  const localPoints = coordinates.map(([lat, lng]) => [
    (lng - refLng) * kx,
    (lat - refLat) * ky
  ]);

  // Calcula distâncias cumulativas ao longo da polilinha original
  const cumDists = [0];
  for (let i = 0; i < localPoints.length - 1; i++) {
    const dx = localPoints[i + 1][0] - localPoints[i][0];
    const dy = localPoints[i + 1][1] - localPoints[i][1];
    cumDists.push(cumDists[i] + Math.hypot(dx, dy));
  }
  const totalMeters = cumDists[cumDists.length - 1];

  if (totalMeters < 50) {
    return {
      overlapFraction: 0,
      longestRepeatedRunMeters: 0,
      uTurnCount: 0,
      totalMeters: Math.round(totalMeters)
    };
  }

  // 1. Reamostra a polilinha a cada ~20 m (interpolação linear)
  const SAMPLE_STEP = 20;
  const samples = [];
  let currSeg = 0;

  for (let targetDist = 0; targetDist <= totalMeters; targetDist += SAMPLE_STEP) {
    while (currSeg < cumDists.length - 2 && cumDists[currSeg + 1] < targetDist) {
      currSeg++;
    }
    const segLen = cumDists[currSeg + 1] - cumDists[currSeg];
    const t = segLen > 0 ? (targetDist - cumDists[currSeg]) / segLen : 0;
    const x = localPoints[currSeg][0] + t * (localPoints[currSeg + 1][0] - localPoints[currSeg][0]);
    const y = localPoints[currSeg][1] + t * (localPoints[currSeg + 1][1] - localPoints[currSeg][1]);
    samples.push({
      index: samples.length,
      dist: targetDist,
      x,
      y
    });
  }

  // 2. Indexa amostras em células de ~10 m
  const CELL_SIZE = 10;
  const grid = new Map();
  const IGNORE_ZONE = 150; // Metros do início e fim ignorados da busca

  for (const s of samples) {
    if (s.dist < IGNORE_ZONE || s.dist > totalMeters - IGNORE_ZONE) {
      continue;
    }
    const cx = Math.floor(s.x / CELL_SIZE);
    const cy = Math.floor(s.y / CELL_SIZE);
    const key = `${cx},${cy}`;
    if (!grid.has(key)) {
      grid.set(key, []);
    }
    grid.get(key).push(s);
  }

  // 3. Identifica amostras repetidas
  // Uma amostra é "repetida" se outra amostra, em célula igual ou vizinha, estiver a mais de ~150 m de distância AO LONGO da rota
  const repeatedFlags = new Array(samples.length).fill(false);

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (s.dist < IGNORE_ZONE || s.dist > totalMeters - IGNORE_ZONE) {
      continue;
    }

    const cx = Math.floor(s.x / CELL_SIZE);
    const cy = Math.floor(s.y / CELL_SIZE);
    let isRepeated = false;

    for (let dx = -1; dx <= 1 && !isRepeated; dx++) {
      for (let dy = -1; dy <= 1 && !isRepeated; dy++) {
        const key = `${cx + dx},${cy + dy}`;
        const cellSamples = grid.get(key);
        if (!cellSamples) continue;

        for (const other of cellSamples) {
          if (other.index === s.index) continue;
          if (Math.abs(s.dist - other.dist) > IGNORE_ZONE) {
            const dSpace = Math.hypot(s.x - other.x, s.y - other.y);
            if (dSpace <= 16) {
              isRepeated = true;
              break;
            }
          }
        }
      }
    }

    if (isRepeated) {
      repeatedFlags[i] = true;
    }
  }

  // Fração de sobreposição e maior trecho contínuo repetido
  let repeatedCount = 0;
  let currentRun = 0;
  let maxRun = 0;

  for (let i = 0; i < samples.length; i++) {
    if (repeatedFlags[i]) {
      repeatedCount++;
      currentRun += SAMPLE_STEP;
      if (currentRun > maxRun) maxRun = currentRun;
    } else {
      currentRun = 0;
    }
  }

  const overlapFraction = samples.length > 0
    ? Number((repeatedCount / samples.length).toFixed(4))
    : 0;

  // 4. Detecção de retornos em U (uTurnCount: variação de rumo > 150° em janela curta <= 60m)
  let uTurnCount = 0;
  let i = 1;
  while (i < samples.length - 1) {
    let detected = false;
    for (const step of [1, 2]) {
      if (i - step >= 0 && i + step < samples.length) {
        const vx1 = samples[i].x - samples[i - step].x;
        const vy1 = samples[i].y - samples[i - step].y;
        const vx2 = samples[i + step].x - samples[i].x;
        const vy2 = samples[i + step].y - samples[i].y;
        const len1 = Math.hypot(vx1, vy1);
        const len2 = Math.hypot(vx2, vy2);

        if (len1 > 1e-4 && len2 > 1e-4) {
          const dot = (vx1 * vx2 + vy1 * vy2) / (len1 * len2);
          const clampedDot = Math.max(-1, Math.min(1, dot));
          const angleDeg = (Math.acos(clampedDot) * 180) / Math.PI;

          if (angleDeg > 150) {
            detected = true;
            break;
          }
        }
      }
    }

    if (detected) {
      uTurnCount++;
      i += 3;
    } else {
      i++;
    }
  }

  return {
    overlapFraction,
    longestRepeatedRunMeters: maxRun,
    uTurnCount,
    totalMeters: Math.round(totalMeters)
  };
}
