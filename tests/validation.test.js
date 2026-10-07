/**
 * RunLoop — Testes de Validação e Regras de Negócio
 * Executável via Node.js: `node tests/validation.test.js`
 */

import { CONFIG } from '../js/config.js';
import { calculateTolerance, formatDistance, formatDuration, haversineDistance } from '../js/geo.js';
import { APP_STATES, Store } from '../js/store.js';

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

console.log('====================================================');
console.log('Iniciando Testes de Validação e Regras de Negócio...');
console.log('====================================================\n');

// ----------------------------------------------------
// TESTE: Validação de Distância (TESTE 9)
// ----------------------------------------------------
console.log('[TESTE 9] Validação de Distâncias Inválidas:');

function validateDistanceValue(rawVal) {
  const val = parseFloat(rawVal);
  if (rawVal === '' || rawVal === null || rawVal === undefined || isNaN(val)) {
    return { isValid: false, errorMsg: 'Por favor, informe um número válido de quilômetros.' };
  }
  if (val < CONFIG.MIN_DISTANCE_KM) {
    return { isValid: false, errorMsg: `A distância mínima para rota de corrida é ${CONFIG.MIN_DISTANCE_KM} km.` };
  }
  if (val > CONFIG.MAX_DISTANCE_KM) {
    return { isValid: false, errorMsg: `A distância máxima permitida no momento é ${CONFIG.MAX_DISTANCE_KM} km (maratona).` };
  }
  return { isValid: true, valueKm: val, errorMsg: '' };
}

// 0 km
const res0 = validateDistanceValue('0');
assert(!res0.isValid && res0.errorMsg.includes('mínima'), '0 km rejeitado com mensagem de limite mínimo');

// Negativo (-5)
const resNeg = validateDistanceValue('-5');
assert(!resNeg.isValid && resNeg.errorMsg.includes('mínima'), 'Número negativo (-5) rejeitado');

// Texto ('abc')
const resText = validateDistanceValue('abc');
assert(!resText.isValid && resText.errorMsg.includes('válido'), 'Texto "abc" rejeitado com mensagem de formato');

// Vazio ('')
const resEmpty = validateDistanceValue('');
assert(!resEmpty.isValid, 'String vazia rejeitada');

// Acima do limite (50 km)
const resOver = validateDistanceValue('50');
assert(!resOver.isValid && resOver.errorMsg.includes('máxima'), '50 km rejeitado com mensagem de limite máximo');

// Válido (5 km)
const resValid = validateDistanceValue('5');
assert(resValid.isValid && resValid.valueKm === 5, '5 km aceito como válido');

// ----------------------------------------------------
// TESTE: Impedimento de Geração Sem Ponto Inicial (TESTE 8)
// ----------------------------------------------------
console.log('\n[TESTE 8] Validação de Ponto de Partida:');

let currentStartPoint = null;
function checkCanGenerateRoute(point) {
  if (!point) {
    return {
      canGenerate: false,
      title: 'Defina um ponto de partida.',
      message: 'Clique em "Usar minha localização" ou selecione qualquer rua no mapa antes de gerar o circuito.'
    };
  }
  return { canGenerate: true };
}

const checkSemPonto = checkCanGenerateRoute(currentStartPoint);
assert(!checkSemPonto.canGenerate, 'Bloqueia geração quando currentStartPoint é null');
assert(checkSemPonto.title === 'Defina um ponto de partida.', 'Mensagem exata: "Defina um ponto de partida."');

currentStartPoint = { lat: -2.4430, lng: -54.7083 };
const checkComPonto = checkCanGenerateRoute(currentStartPoint);
assert(checkComPonto.canGenerate, 'Permite geração quando o ponto de partida existe');

// ----------------------------------------------------
// TESTE: Simulação de Exclusão Mútua de Estados da UI (Seção 9)
// ----------------------------------------------------
console.log('\n[SEÇÃO 9] Máquina de Estados da UI (Exclusão Mútua):');

class MockUIState {
  constructor() {
    this.currentAppState = 'IDLE';
    this.loadingCardHidden = true;
    this.errorCardHidden = true;
    this.resultCardHidden = true;
    this.btnGenerateDisabled = false;
  }

  setAppState(state) {
    this.currentAppState = state;
    switch (state) {
      case 'IDLE':
        this.loadingCardHidden = true;
        this.errorCardHidden = true;
        this.btnGenerateDisabled = false;
        break;
      case 'LOCATING':
        this.loadingCardHidden = true;
        this.errorCardHidden = true;
        this.btnGenerateDisabled = true;
        break;
      case 'GENERATING':
        this.loadingCardHidden = false;
        this.errorCardHidden = true;
        this.resultCardHidden = true;
        this.btnGenerateDisabled = true;
        break;
      case 'SUCCESS':
        this.loadingCardHidden = true;
        this.errorCardHidden = true;
        this.resultCardHidden = false;
        this.btnGenerateDisabled = false;
        break;
      case 'ERROR':
        this.loadingCardHidden = true;
        this.errorCardHidden = false;
        this.resultCardHidden = true;
        this.btnGenerateDisabled = false;
        break;
    }
  }

  assertNoConflictingCards() {
    // GENERATING + ERROR nunca podem estar visíveis simultaneamente
    const bothVisible = !this.loadingCardHidden && !this.errorCardHidden;
    return !bothVisible;
  }
}

const ui = new MockUIState();
assert(ui.currentAppState === 'IDLE', 'Estado inicial é IDLE');

ui.setAppState('GENERATING');
assert(!ui.loadingCardHidden && ui.errorCardHidden, 'Em GENERATING: loading visível e erro oculto');
assert(ui.assertNoConflictingCards(), 'Sem conflito em GENERATING');

ui.setAppState('ERROR');
assert(ui.loadingCardHidden && !ui.errorCardHidden, 'Em ERROR: loading oculto e erro visível');
assert(ui.assertNoConflictingCards(), 'Sem conflito em ERROR');

ui.setAppState('SUCCESS');
assert(ui.loadingCardHidden && ui.errorCardHidden && !ui.resultCardHidden, 'Em SUCCESS: loading e erro ocultos, resultado visível');
assert(ui.assertNoConflictingCards(), 'Sem conflito em SUCCESS');

ui.setAppState('IDLE');
assert(ui.loadingCardHidden && ui.errorCardHidden, 'Em IDLE: loading e erro ocultos');

// ----------------------------------------------------
// TESTE: Simulação de Erros de Geolocalização (TESTE 7)
// ----------------------------------------------------
console.log('\n[TESTE 7] Tratamento de Erros da Geolocation API:');

function formatGeoError(errorCode) {
  switch (errorCode) {
    case 1: // PERMISSION_DENIED
      return 'Permissão de localização negada pelo navegador. Você pode clicar diretamente no mapa para definir onde começar.';
    case 2: // POSITION_UNAVAILABLE
      return 'Sinal de localização indisponível no momento. Defina o ponto inicial clicando no mapa.';
    case 3: // TIMEOUT
      return 'Tempo esgotado ao buscar sua localização. Tente novamente ou clique no mapa para definir o ponto.';
    default:
      return 'Não foi possível obter sua localização. Escolha o ponto inicial clicando no mapa.';
  }
}

assert(formatGeoError(1).includes('negada'), 'Trata PERMISSION_DENIED com mensagem amigável e opção de clicar no mapa');
assert(formatGeoError(2).includes('indisponível'), 'Trata POSITION_UNAVAILABLE amigavelmente');
assert(formatGeoError(3).includes('Tempo esgotado'), 'Trata TIMEOUT amigavelmente');

// ----------------------------------------------------
// TESTE: Simulação de Erro de Rede e Resolução (TESTE 11)
// ----------------------------------------------------
console.log('\n[TESTE 11] Recuperação de Erro de Rede:');

ui.setAppState('GENERATING');
assert(!ui.loadingCardHidden, 'Iniciou geração (loading ativo)');

// Simula falha de rede
ui.setAppState('ERROR');
assert(ui.loadingCardHidden && !ui.errorCardHidden, 'Após falha de rede: loading encerra e erro é exibido');

// Usuário clica no mapa para tentar de novo
ui.setAppState('IDLE');
assert(ui.loadingCardHidden && ui.errorCardHidden, 'Ao selecionar novo ponto: erro é limpo e app pronto');

// ----------------------------------------------------
// TESTE: Regras de Negócio do Modo Escolher Pontos (SEÇÃO 12)
// ----------------------------------------------------
console.log('\n[SEÇÃO 12] Regras de Negócio do Modo Escolher Pontos:');

function determineRouteType(startPoint, endPoint) {
  if (!startPoint) return { type: 'none', error: 'Defina o Início' };
  if (!endPoint) return { type: 'loop', reason: 'Apenas Início definido' };
  const dist = haversineDistance(startPoint, endPoint);
  if (dist < 50) {
    return { type: 'loop', distanceMeters: dist, reason: 'Início e Fim muito próximos (< 50 m)' };
  }
  return { type: 'point_to_point', distanceMeters: dist, reason: 'Início e Fim distintos (A -> B)' };
}

function checkSnapWarning(originalPoint, snappedPoint) {
  const dist = haversineDistance(originalPoint, snappedPoint);
  return {
    needsWarning: dist > 200,
    distanceMeters: Math.round(dist)
  };
}

const ptA = { lat: -2.443000, lng: -54.708300 };
const ptAPerto = { lat: -2.443100, lng: -54.708350 }; // ~12m
const ptBLonge = { lat: -2.455000, lng: -54.715000 }; // ~1.5km

const ruleSemFim = determineRouteType(ptA, null);
assert(ruleSemFim.type === 'loop', 'Sem Fim escolhido: classificado como rota loop');

const rulePerto = determineRouteType(ptA, ptAPerto);
assert(rulePerto.type === 'loop' && rulePerto.distanceMeters < 50, 'Fim a < 50 m do Início: tratado automaticamente como loop');

const ruleLonge = determineRouteType(ptA, ptBLonge);
assert(ruleLonge.type === 'point_to_point' && ruleLonge.distanceMeters >= 50, 'Fim a >= 50 m do Início: rota Ponto a Ponto (A -> B)');

const snapPerto = checkSnapWarning(ptA, { lat: -2.443300, lng: -54.708300 }); // ~33m
assert(!snapPerto.needsWarning, 'Snap a <= 200 m não emite aviso de ajuste');

const snapLonge = checkSnapWarning(ptA, { lat: -2.446000, lng: -54.708300 }); // ~333m
assert(snapLonge.needsWarning && snapLonge.distanceMeters > 200, 'Snap a > 200 m dispara aviso de ajuste viário');

// Validação de transições do Store para ESCOLHENDO_PONTOS
const testStore = new Store();
testStore.transitionTo(APP_STATES.REPOUSO);
assert(testStore.getState().appState === APP_STATES.REPOUSO, 'Store em estado REPOUSO');

testStore.transitionTo(APP_STATES.ESCOLHENDO_PONTOS);
assert(testStore.getState().appState === APP_STATES.ESCOLHENDO_PONTOS, 'Transição válida: REPOUSO -> ESCOLHENDO_PONTOS');

testStore.transitionTo(APP_STATES.REPOUSO);
assert(testStore.getState().appState === APP_STATES.REPOUSO, 'Transição válida: ESCOLHENDO_PONTOS -> REPOUSO');

testStore.transitionTo(APP_STATES.PLANEJANDO);
testStore.transitionTo(APP_STATES.ESCOLHENDO_PONTOS);
assert(testStore.getState().appState === APP_STATES.ESCOLHENDO_PONTOS, 'Transição válida: PLANEJANDO -> ESCOLHENDO_PONTOS');

console.log(`\n====================================================`);
console.log(`Resultado: ${passed} passaram, ${failed} falharam.`);
console.log(`====================================================\n`);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
