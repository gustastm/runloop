/**
 * RunLoop — Testes Unitários de Funções Puras do Rastreador (GPS e Métricas)
 */

import {
  filterGpsSample,
  formatStopwatch,
  calculateAveragePace,
  calculateTotalMovingTime
} from '../js/geo.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FALHOU: ${message}`);
    failed++;
  }
}

console.log('--- Executando testes do Rastreador (geo.js) ---\n');

console.log('[1] Filtro de precisão GPS:');
const sampleAccurate = { lat: -2.443000, lng: -54.708300, timestamp: 1000, accuracy: 12 };
const sampleInaccurate = { lat: -2.443050, lng: -54.708300, timestamp: 2000, accuracy: 35 };

assert(filterGpsSample(null, sampleAccurate).accepted === true, 'Primeiro ponto preciso é aceito');
const resAcc = filterGpsSample(sampleAccurate, sampleInaccurate);
assert(resAcc.accepted === false && resAcc.reason === 'ACCURACY_EXCEEDED', 'Ponto com precisão > 30m é descartado');

console.log('\n[2] Filtro de salto de velocidade (spike):');
// 1 segundo depois, deslocamento de 100m -> 100 m/s (> 10 m/s)
const sampleTeleport = { lat: -2.443900, lng: -54.708300, timestamp: 2000, accuracy: 10 };
const resSpeed = filterGpsSample(sampleAccurate, sampleTeleport, { maxSpeedMps: 10 });
assert(resSpeed.accepted === false && resSpeed.reason === 'SPEED_SPIKE', 'Salto absurdo de velocidade é descartado');

console.log('\n[3] Filtro de deslocamento mínimo:');
// Deslocamento de apenas ~1m (ruído de GPS parado)
const sampleJitter = { lat: -2.443008, lng: -54.708300, timestamp: 2000, accuracy: 10 };
const resJitter = filterGpsSample(sampleAccurate, sampleJitter, { minDisplacementMeters: 5 });
assert(resJitter.accepted === false && resJitter.reason === 'BELOW_MIN_DISPLACEMENT', 'Deslocamento < 5m não soma distância');

// Deslocamento de 15m em 4s -> ~3.75 m/s (~13.5 km/h, corrida saudável)
const sampleValidRun = { lat: -2.443135, lng: -54.708300, timestamp: 5000, accuracy: 8 };
const resValid = filterGpsSample(sampleAccurate, sampleValidRun);
assert(resValid.accepted === true && resValid.distanceMeters >= 14 && resValid.distanceMeters <= 16, 'Passada real de corrida é aceita');

console.log('\n[4] Formatação de cronômetro (formatStopwatch):');
assert(formatStopwatch(0) === '00:00', '0s formata como 00:00');
assert(formatStopwatch(59) === '00:59', '59s formata como 00:59');
assert(formatStopwatch(65) === '01:05', '65s formata como 01:05');
assert(formatStopwatch(3599) === '59:59', '3599s formata como 59:59');
assert(formatStopwatch(3600) === '01:00:00', '3600s formata como 01:00:00');
assert(formatStopwatch(3665) === '01:01:05', '3665s formata como 01:01:05');

console.log('\n[5] Cálculo de ritmo médio (calculateAveragePace):');
assert(calculateAveragePace(10, 30) === '--:--', 'Distância < 50m exibe --:--');
assert(calculateAveragePace(0, 100) === '--:--', 'Tempo zero exibe --:--');
// 1000m em 300s (5 minutos) -> 5:00 /km
assert(calculateAveragePace(300, 1000) === '5:00', '1 km em 5 min dá 5:00');
// 5000m em 1650s (27m30s) -> 5:30 /km
assert(calculateAveragePace(1650, 5000) === '5:30', '5 km em 27m30s dá 5:30');
// 1000m em 255s (4m15s) -> 4:15 /km
assert(calculateAveragePace(255, 1000) === '4:15', '1 km em 4m15s dá 4:15');

console.log('\n[6] Cálculo de tempo com pausas (calculateTotalMovingTime):');
// Início: 1000, Fim: 10000 (total 9s), Pausa de 3000 a 6000 (3s) -> 6s em movimento
const pauses = [{ start: 3000, end: 6000 }];
const movingSec = calculateTotalMovingTime(1000, 10000, pauses);
assert(movingSec === 6, 'Desconta 3s de pausa corretamente (9s total - 3s pausa = 6s)');

// Pausa ainda aberta (em andamento)
const openPause = [{ start: 5000, end: null }];
const pausedSec = calculateTotalMovingTime(1000, 7000, openPause);
assert(pausedSec === 4, 'Pausa aberta congela tempo (7s - 2s = 4s)');

console.log('\n========================================');
console.log(`Resultado Rastreador: ${passed} passaram, ${failed} falharam.`);
console.log('========================================');

if (failed > 0) process.exit(1);
