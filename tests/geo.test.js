/**
 * RunLoop — Testes unitários para funções puras de geo.js
 * Executável via Node.js: `node tests/geo.test.js`
 */

import {
  toRad,
  toDeg,
  haversineDistance,
  destinationPoint,
  calculatePolylineDistance,
  formatDistance,
  formatDuration,
  calculateTolerance,
  computeRouteQuality
} from '../js/geo.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FALHA: ${message}`);
    failed++;
  }
}

function assertApprox(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    console.log(`  ✓ ${message} (esperado ~${expected}, obtido ${actual})`);
    passed++;
  } else {
    console.error(`  ✗ FALHA: ${message} (esperado ~${expected}, obtido ${actual}, diferença ${diff} > ${tolerance})`);
    failed++;
  }
}

console.log('--- Executando testes de geo.js ---');

// 1. toRad & toDeg
console.log('\n[1] Conversões de ângulo:');
assertApprox(toRad(180), Math.PI, 0.0001, 'toRad(180) deve ser PI');
assertApprox(toDeg(Math.PI / 2), 90, 0.0001, 'toDeg(PI/2) deve ser 90');

// 2. haversineDistance
console.log('\n[2] Distância Haversine:');
// Distância conhecida: Marco Zero de SP (-23.5505, -46.6333) até Parque Ibirapuera (-23.5874, -46.6576) ~ 4.78 km
const dSP = haversineDistance(-23.5505, -46.6333, -23.5874, -46.6576);
assertApprox(dSP, 4780, 50, 'Distância SP Centro -> Ibirapuera (~4.78 km)');

// Distância ponto a si mesmo deve ser 0
assertApprox(haversineDistance(-23.5505, -46.6333, -23.5505, -46.6333), 0, 0.01, 'Distância do ponto a ele mesmo é 0');

// 3. destinationPoint
console.log('\n[3] Ponto de destino por rumo e distância:');
// Andar 1000m para o Norte a partir do Equador (0, 0)
const pNorth = destinationPoint(0, 0, 1000, 0);
assertApprox(pNorth.lat, 0.008993, 0.0005, '1000m ao Norte eleva latitude em ~0.009°');
assertApprox(pNorth.lng, 0, 0.0001, '1000m ao Norte mantém longitude');

// Calcular ida e volta: andar 1000m a 90° e medir a distância de volta
const pEast = destinationPoint(-23.55, -46.63, 1000, 90);
const distCalculated = haversineDistance(-23.55, -46.63, pEast.lat, pEast.lng);
assertApprox(distCalculated, 1000, 5, 'Distância calculada para o ponto de destino deve ser ~1000m');

// 4. calculatePolylineDistance
console.log('\n[4] Distância de polilinha:');
const poly = [
  [-23.55, -46.63],
  [-23.56, -46.63], // ~1111m ao Sul
  [-23.56, -46.64]  // ~1020m ao Oeste
];
const polyDist = calculatePolylineDistance(poly);
assert(polyDist > 2000 && polyDist < 2300, `Distância acumulada da polilinha é ~2130m (obtido: ${polyDist.toFixed(1)}m)`);
assert(calculatePolylineDistance([]) === 0, 'Polilinha vazia retorna 0m');
assert(calculatePolylineDistance([[-23.55, -46.63]]) === 0, 'Polilinha com 1 ponto retorna 0m');

// 5. formatDistance
console.log('\n[5] Formatação de distância:');
assert(formatDistance(500) === '500 m', 'Formata 500m corretamente');
assert(formatDistance(1250) === '1.25 km', 'Formata 1250m como 1.25 km');
assert(formatDistance(5000) === '5.00 km', 'Formata 5000m como 5.00 km');
assert(formatDistance(0) === '0 m', 'Formata 0m como 0 m');

// 6. formatDuration
console.log('\n[6] Formatação de duração:');
assert(formatDuration(27.5) === '28 min', 'Formata 27.5 min como 28 min');
assert(formatDuration(65) === '1h 5 min', 'Formata 65 min como 1h 5 min');
assert(formatDuration(120) === '2h', 'Formata 120 min como 2h');

// 7. calculateTolerance
console.log('\n[7] Cálculo de tolerância:');
const tol1 = calculateTolerance(5000, 5200, 10); // +200m (+4%)
assert(tol1.isWithinTolerance === true, '5200m para 5000m (+4%) está dentro da tolerância de 10%');
assert(tol1.differenceKm === 0.2, 'Diferença de 0.2 km');
assert(tol1.diffPercent === 4, 'Diferença de 4.0%');

const tol2 = calculateTolerance(5000, 5800, 10); // +800m (+16%)
assert(tol2.isWithinTolerance === false, '5800m para 5000m (+16%) está fora da tolerância de 10%');
assert(tol2.diffPercent === 16, 'Diferença de 16.0%');

const tol3 = calculateTolerance(10000, 9200, 10); // -800m (-8%)
assert(tol3.isWithinTolerance === true, '9200m para 10000m (-8%) está dentro da tolerância de 10%');

// 8. computeRouteQuality com fixtures sintéticas
console.log('\n[8] computeRouteQuality com fixtures sintéticas:');
console.log('  (Aviso: estas fixtures são dados geométricos sintéticos de teste, não rotas da aplicação)');

// Fixture 1: Quadrado fechado de 1000m x 1000m (~0% repetição, 0 U-turns)
const p0 = { lat: 0, lng: 0 };
const pTop = destinationPoint(0, 0, 1000, 0); // 1000m Norte
const pRightTop = destinationPoint(pTop.lat, pTop.lng, 1000, 90); // 1000m Leste
const pRightBottom = destinationPoint(pRightTop.lat, pRightTop.lng, 1000, 180); // 1000m Sul
const squarePolyline = [
  [p0.lat, p0.lng],
  [pTop.lat, pTop.lng],
  [pRightTop.lat, pRightTop.lng],
  [pRightBottom.lat, pRightBottom.lng],
  [p0.lat, p0.lng]
];
const qSquare = computeRouteQuality(squarePolyline, p0);
assertApprox(qSquare.overlapFraction, 0, 0.01, 'Quadrado fechado possui ~0% de sobreposição');
assert(qSquare.longestRepeatedRunMeters === 0, 'Quadrado fechado tem 0m de maior trecho repetido');
assert(qSquare.uTurnCount === 0, 'Quadrado fechado com curvas de 90° possui 0 retornos em U');

// Fixture 2: Ida e volta pelo mesmo segmento (2000m ida + 2000m volta, alta repetição)
const pTurn = destinationPoint(0, 0, 2000, 0); // 2000m Norte
const outAndBackPolyline = [
  [p0.lat, p0.lng],
  [pTurn.lat, pTurn.lng],
  [p0.lat, p0.lng]
];
const qOutAndBack = computeRouteQuality(outAndBackPolyline, p0);
assert(qOutAndBack.overlapFraction >= 0.70, `Ida e volta possui repetição alta (${(qOutAndBack.overlapFraction * 100).toFixed(1)}% >= 70%)`);
assert(qOutAndBack.longestRepeatedRunMeters >= 1500, `Ida e volta detecta trecho repetido longo (${qOutAndBack.longestRepeatedRunMeters}m >= 1500m)`);
assert(qOutAndBack.uTurnCount >= 1, `Ida e volta detecta o retorno em U no ponto de retorno (uTurnCount = ${qOutAndBack.uTurnCount})`);

// Fixture 3: Trecho repetido só no meio da rota (spur/antena de 300m no km 0.6)
const pMid1 = destinationPoint(0, 0, 600, 0);
const pSpur = destinationPoint(pMid1.lat, pMid1.lng, 300, 90); // 300m Leste e volta
const pMid2 = destinationPoint(0, 0, 1200, 0);
const pMid3 = destinationPoint(pMid2.lat, pMid2.lng, 1000, 90);
const pMid4 = destinationPoint(pMid3.lat, pMid3.lng, 1200, 180);
const midSpurPolyline = [
  [p0.lat, p0.lng],
  [pMid1.lat, pMid1.lng],
  [pSpur.lat, pSpur.lng],
  [pMid1.lat, pMid1.lng], // Retorno do spur no meio da rota
  [pMid2.lat, pMid2.lng],
  [pMid3.lat, pMid3.lng],
  [pMid4.lat, pMid4.lng],
  [p0.lat, p0.lng]
];
const qMidSpur = computeRouteQuality(midSpurPolyline, p0);
assert(qMidSpur.overlapFraction > 0.05, `Trecho repetido no meio é detectado (overlap = ${(qMidSpur.overlapFraction * 100).toFixed(1)}% > 5%)`);
assert(qMidSpur.longestRepeatedRunMeters >= 200, `Detecta extensão do spur repetido no meio (${qMidSpur.longestRepeatedRunMeters}m >= 200m)`);
assert(qMidSpur.uTurnCount >= 1, `Detecta retorno em U no bico do spur (uTurnCount = ${qMidSpur.uTurnCount})`);

console.log(`\n========================================`);
console.log(`Resultado: ${passed} passaram, ${failed} falharam.`);
console.log(`========================================`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
