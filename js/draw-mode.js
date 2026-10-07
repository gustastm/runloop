/**
 * RunLoop — Módulo de Desenho Manual de Rotas
 * 
 * Permite ao usuário clicar no mapa para adicionar pontos, calcular distância
 * acumulada em linha reta (Haversine) em tempo real, desfazer o último ponto ou limpar.
 */

import { calculatePolylineDistance } from './geo.js';

let points = []; // Array de pares [lat, lng]
let onChangeCallback = null;

/**
 * Registra callback chamado sempre que a lista de pontos manuais for alterada
 * @param {function} cb - ({ points, totalMeters }) => void
 */
export function onDrawChange(cb) {
  onChangeCallback = cb;
}

/**
 * Notifica ouvintes sobre a alteração
 */
function notifyChange() {
  const totalMeters = calculatePolylineDistance(points);
  if (typeof onChangeCallback === 'function') {
    onChangeCallback({
      points: [...points],
      totalMeters,
      count: points.length
    });
  }
}

/**
 * Adiciona um ponto à rota manual
 * @param {number} lat 
 * @param {number} lng 
 */
export function addManualPoint(lat, lng) {
  points.push([lat, lng]);
  notifyChange();
}

/**
 * Remove o último ponto adicionado (Desfazer)
 * @returns {[number, number]|null}
 */
export function undoManualPoint() {
  if (points.length === 0) return null;
  const removed = points.pop();
  notifyChange();
  return removed;
}

/**
 * Limpa todos os pontos do desenho manual
 */
export function clearManualPoints() {
  points = [];
  notifyChange();
}

/**
 * Retorna a lista atual de pontos
 * @returns {Array<[number, number]>}
 */
export function getManualPoints() {
  return [...points];
}

/**
 * Retorna o objeto padronizado da rota desenhada manualmente
 * @returns {object|null}
 */
export function getStandardizedManualRoute() {
  if (points.length < 2) return null;

  const totalMeters = calculatePolylineDistance(points);

  return {
    id: `manual_${Date.now()}`,
    type: 'manual',
    start: {
      lat: points[0][0],
      lng: points[0][1]
    },
    coordinates: [...points],
    distanceMeters: Math.round(totalMeters),
    createdAt: new Date().toISOString()
  };
}
