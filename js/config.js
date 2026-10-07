/**
 * RunLoop — Configurações globais do sistema
 * 
 * Centraliza parâmetros de roteamento, tolerância, limites e valores padrão.
 */

export const CONFIG = {
  // Serviço de Roteamento OSRM
  // Validado: routing.openstreetmap.de usa perfil routed-foot (a pé/corrida) com suporte a CORS
  // Alternativa (não padrão): 'https://router.project-osrm.org/route/v1/foot' (usa perfil de carro no servidor demo público)
  ROUTING_ENDPOINT: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot',
  
  // Endpoint secundário de fallback caso o principal esteja indisponível
  ROUTING_FALLBACK_ENDPOINT: 'https://router.project-osrm.org/route/v1/foot',

  // Tolerância padrão para rotas circulares (±10%)
  DEFAULT_TOLERANCE_PERCENT: 10,

  // Limites de distância em quilômetros
  MIN_DISTANCE_KM: 1,
  MAX_DISTANCE_KM: 42,
  DEFAULT_DISTANCE_KM: 5,

  // Algoritmo de Rota Circular
  MAX_ATTEMPTS: 6,                 // Número máximo de iterações (compatibilidade)
  MAX_TOTAL_REQUESTS: 12,          // Limite máximo de requisições OSRM por geração
  INITIAL_CORRECTION_FACTOR: 0.68, // Relação raio euclidiano vs traçado real de ruas
  WAYPOINTS_COUNT: 6,              // 6 waypoints para melhor contorno e menor repetição
  OVERLAP_TARGET: 0.08,            // Alvo de sobreposição máxima (8%)
  DELAY_BETWEEN_ATTEMPTS_MS: 250,  // Pausa entre requisições para respeitar o rate-limit do OSRM

  // Pesos para o cálculo de pontuação (score) da rota. Menor é melhor.
  // w1: penalidade por erro relativo de distância (|real - pedida| / pedida)
  // w2: penalidade por fração de sobreposição (overlapFraction)
  // w3: penalidade por extensão do maior trecho repetido contínuo (longestRepeatedRun / pedida)
  // w4: penalidade por número de retornos em U (uTurnCount)
  SCORE_WEIGHTS: {
    w1: 2.0, // Peso do erro de distância relativo (mantém aderência à meta)
    w2: 2.5, // Peso da sobreposição total (foco principal em evitar repetições)
    w3: 1.0, // Peso da maior extensão contínua repetida (evita longos "vai e volta")
    w4: 0.15 // Peso para cada retorno em U brusco detectado
  },

  // Timeout para requisições de rede (ms)
  REQUEST_TIMEOUT_MS: 12000,

  // Visão neutra inicial do mapa (sem assumir nenhuma cidade ou localização do usuário)
  DEFAULT_MAP_VIEW: {
    lat: -14.235,
    lng: -51.9253,
    zoom: 4
  },

  // Ritmo médio de corrida para estimativa de tempo (min/km)
  ESTIMATED_PACE_MIN_PER_KM: 5.5
};
