/**
 * RunLoop — Teste de Integração Real com OSRM e Algoritmo de Loop
 * Executável via Node.js: `node tests/integration.test.js`
 */

import { generateLoopRoute } from '../js/loop-generator.js';
import { calculateTolerance, formatDistance } from '../js/geo.js';
import {
  addManualPoint,
  undoManualPoint,
  clearManualPoints,
  getManualPoints,
  getStandardizedManualRoute
} from '../js/draw-mode.js';

async function runIntegrationTests() {
  console.log('====================================================');
  console.log('Iniciando Testes de Integração com a API OSRM real...');
  console.log('====================================================\n');

  // Ponto 1: Santarém, Pará (coordenadas reais da cidade do usuário)
  const santaremPoint = { lat: -2.4430, lng: -54.7083 };

  // 1. Teste de 3 km
  console.log('[Teste 1] Gerando rota de 3 km em Santarém, PA...');
  const route3k = await generateLoopRoute({
    startPoint: santaremPoint,
    requestedDistanceKm: 3,
    rotationOffset: 0,
    tolerancePercent: 10,
    onProgress: (p) => console.log(`  -> ${p.status}`)
  });

  console.log(`✓ Rota de 3 km gerada com sucesso!`);
  console.log(`  - Distância pedida: ${(route3k.requestedMeters / 1000).toFixed(2)} km`);
  console.log(`  - Distância real: ${(route3k.distanceMeters / 1000).toFixed(2)} km`);
  console.log(`  - Diferença: ${route3k.tolerance.differenceKm} km (${route3k.tolerance.diffPercent}%)`);
  console.log(`  - Dentro da tolerância: ${route3k.tolerance.isWithinTolerance}`);
  console.log(`  - Total de coordenadas: ${route3k.coordinates.length}`);

  // 2. Teste de 5 km
  console.log('\n[Teste 2] Gerando rota de 5 km em Santarém, PA...');
  const route5k = await generateLoopRoute({
    startPoint: santaremPoint,
    requestedDistanceKm: 5,
    rotationOffset: 0,
    tolerancePercent: 10,
    onProgress: (p) => console.log(`  -> ${p.status}`)
  });

  console.log(`✓ Rota de 5 km gerada com sucesso!`);
  console.log(`  - Distância real: ${(route5k.distanceMeters / 1000).toFixed(2)} km`);
  console.log(`  - Diferença: ${route5k.tolerance.differenceKm} km (${route5k.tolerance.diffPercent}%)`);
  console.log(`  - Dentro da tolerância: ${route5k.tolerance.isWithinTolerance}`);
  console.log(`  - Total de coordenadas: ${route5k.coordinates.length}`);

  // 3. Teste de 10 km
  console.log('\n[Teste 3] Gerando rota de 10 km em Santarém, PA...');
  const route10k = await generateLoopRoute({
    startPoint: santaremPoint,
    requestedDistanceKm: 10,
    rotationOffset: 0,
    tolerancePercent: 10,
    onProgress: (p) => console.log(`  -> ${p.status}`)
  });

  console.log(`✓ Rota de 10 km gerada com sucesso!`);
  console.log(`  - Distância real: ${(route10k.distanceMeters / 1000).toFixed(2)} km`);
  console.log(`  - Diferença: ${route10k.tolerance.differenceKm} km (${route10k.tolerance.diffPercent}%)`);
  console.log(`  - Dentro da tolerância: ${route10k.tolerance.isWithinTolerance}`);
  console.log(`  - Total de coordenadas: ${route10k.coordinates.length}`);

  // 4. Teste de "Gerar outro traçado" (variação com ângulo diferente)
  console.log('\n[Teste 4] Testando "Gerar outro traçado" (rotação diferente de 5 km)...');
  const route5kAlt = await generateLoopRoute({
    startPoint: santaremPoint,
    requestedDistanceKm: 5,
    rotationOffset: 120,
    tolerancePercent: 10,
    onProgress: (p) => console.log(`  -> ${p.status}`)
  });

  const isDifferentGeometry = JSON.stringify(route5k.coordinates) !== JSON.stringify(route5kAlt.coordinates);
  console.log(`✓ Novo traçado gerado!`);
  console.log(`  - Distância real da rota alternativa: ${(route5kAlt.distanceMeters / 1000).toFixed(2)} km`);
  console.log(`  - Geometria diferente da anterior: ${isDifferentGeometry}`);
  if (!isDifferentGeometry) throw new Error('A rota gerada com rotação alternativa é idêntica à anterior');

  // 5. Teste de Desenho Manual (Adicionar, Desfazer, Limpar)
  console.log('\n[Teste 5] Testando modo de Desenho Manual...');
  clearManualPoints();
  addManualPoint(-2.4430, -54.7083);
  addManualPoint(-2.4450, -54.7060);
  addManualPoint(-2.4470, -54.7040);
  
  let manualPts = getManualPoints();
  console.log(`  - Pontos adicionados: ${manualPts.length}`);
  if (manualPts.length !== 3) throw new Error('Falha ao adicionar pontos');

  const manualRoute = getStandardizedManualRoute();
  console.log(`  - Distância em linha reta calculada: ${formatDistance(manualRoute.distanceMeters)}`);

  undoManualPoint();
  manualPts = getManualPoints();
  console.log(`  - Após desfazer: ${manualPts.length} pontos`);
  if (manualPts.length !== 2) throw new Error('Falha no desfazer');

  clearManualPoints();
  manualPts = getManualPoints();
  console.log(`  - Após limpar: ${manualPts.length} pontos`);
  if (manualPts.length !== 0) throw new Error('Falha no limpar');

  // 6. Teste de Cancelamento (AbortController)
  console.log('\n[Teste 6] Testando cancelamento via AbortController...');
  const controller = new AbortController();
  const abortPromise = generateLoopRoute({
    startPoint: santaremPoint,
    requestedDistanceKm: 5,
    signal: controller.signal
  });
  controller.abort();
  try {
    await abortPromise;
    throw new Error('Deveria ter lançado AbortError');
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('  ✓ AbortError capturado com sucesso ao cancelar operação.');
    } else {
      throw err;
    }
  }

  console.log('\n====================================================');
  console.log('✓ TODOS OS TESTES DE INTEGRAÇÃO PASSARAM COM SUCESSO!');
  console.log('====================================================\n');
}

runIntegrationTests().catch(err => {
  console.error('Falha nos testes de integração:', err);
  process.exit(1);
});
