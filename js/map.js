/**
 * RunLoop — Módulo de Gerenciamento do Mapa (Leaflet)
 * 
 * Cria o mapa, camadas de satélite/ruas, marcadores personalizados em SVG,
 * renderização de traçados e tratamento de eventos de clique.
 */

import { CONFIG } from './config.js';

let mapInstance = null;
let startMarker = null;
let routePolylineGlow = null;
let routePolylineMain = null;
let waypointMarkers = [];
let manualMarkers = [];
let manualPolyline = null;

// Callbacks registrados para cliques no mapa
let onMapClickCallback = null;

/**
 * Cria o ícone SVG customizado para o ponto de partida / chegada
 * @param {string} label 
 * @returns {L.DivIcon}
 */
function createStartPinIcon(label = 'Início') {
  return L.divIcon({
    className: 'runloop-marker-container',
    html: `
      <div class="runloop-start-pin" title="${label}">
        <div class="pin-pulse"></div>
        <div class="pin-badge">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
            <line x1="4" y1="22" x2="4" y2="15"></line>
          </svg>
        </div>
        <span class="pin-label">${label}</span>
      </div>
    `,
    iconSize: [36, 48],
    iconAnchor: [18, 44]
  });
}

/**
 * Cria ícone discreto para waypoints intermediários
 * @param {number} index 
 * @returns {L.DivIcon}
 */
function createWaypointIcon(index) {
  return L.divIcon({
    className: 'runloop-wp-container',
    html: `<div class="runloop-wp-dot" title="Ponto ${index}">${index}</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
}

let currentStartPoint = null;

/**
 * Inicializa a instância do Leaflet
 * @param {string} containerId - ID do elemento DOM do mapa
 * @param {object} initialView - { lat, lng, zoom }
 * @returns {L.Map}
 */
export function initMap(containerId = 'map', initialView = CONFIG.DEFAULT_MAP_VIEW) {
  if (mapInstance) {
    mapInstance.remove();
  }

  // Cria mapa com visão neutra inicial (sem marcador e sem assumir cidade do usuário)
  mapInstance = L.map(containerId, {
    zoomControl: false, // reposicionaremos para uma área mais ergonômica
    attributionControl: true
  }).setView([initialView.lat, initialView.lng], initialView.zoom);

  // Adiciona controle de zoom no canto superior direito para não colidir com o painel
  L.control.zoom({ position: 'topright' }).addTo(mapInstance);

  // Camada padrão do OpenStreetMap com atribuição visível obrigatória
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> colaboradores'
  }).addTo(mapInstance);

  // Escuta cliques no mapa
  mapInstance.on('click', (e) => {
    if (typeof onMapClickCallback === 'function') {
      onMapClickCallback({
        lat: Number(e.latlng.lat.toFixed(6)),
        lng: Number(e.latlng.lng.toFixed(6))
      });
    }
  });

  return mapInstance;
}

/**
 * Registra o handler para cliques no mapa
 * @param {function} callback - ({lat, lng}) => void
 */
export function setMapClickHandler(callback) {
  onMapClickCallback = callback;
}

/**
 * Define ou move o marcador de início
 * @param {number} lat 
 * @param {number} lng 
 * @param {boolean} [pan=true] - se deve centralizar a visão do mapa
 */
export function setStartPoint(lat, lng, pan = true) {
  if (!mapInstance) return;

  const latNum = Number(lat.toFixed(6));
  const lngNum = Number(lng.toFixed(6));
  const latlng = [latNum, lngNum];

  currentStartPoint = { lat: latNum, lng: lngNum };

  if (!startMarker) {
    startMarker = L.marker(latlng, {
      icon: createStartPinIcon('Início / Fim'),
      draggable: true
    }).addTo(mapInstance);

    // Permitir arrastar o marcador para reposicionar
    startMarker.on('dragend', (e) => {
      const pos = e.target.getLatLng();
      const updatedLat = Number(pos.lat.toFixed(6));
      const updatedLng = Number(pos.lng.toFixed(6));
      currentStartPoint = { lat: updatedLat, lng: updatedLng };

      if (typeof onMapClickCallback === 'function') {
        onMapClickCallback({
          lat: updatedLat,
          lng: updatedLng
        });
      }
    });
  } else {
    startMarker.setLatLng(latlng);
  }

  if (pan) {
    if (mapInstance.getZoom() < 13) {
      mapInstance.setView(latlng, 15, { animate: true });
    } else {
      mapInstance.panTo(latlng, { animate: true, duration: 0.6 });
    }
  }
}

/**
 * Retorna as coordenadas atuais do ponto de partida ou null se não definido
 * @returns {{lat: number, lng: number}|null}
 */
export function getStartPoint() {
  if (currentStartPoint) {
    return { ...currentStartPoint };
  }
  return null;
}

/**
 * Verifica se já existe um ponto de partida selecionado
 * @returns {boolean}
 */
export function hasStartPoint() {
  return currentStartPoint !== null;
}

/**
 * Renderiza uma rota circular automática no mapa
 * @param {object} routeData 
 */
export function renderRoute(routeData) {
  if (!mapInstance || !routeData || !routeData.coordinates) return;

  clearRouteLayers();

  const coords = routeData.coordinates;

  // Linha de fundo / brilho para contraste impecável em qualquer mapa
  routePolylineGlow = L.polyline(coords, {
    color: '#0284c7', // azul céu de contraste
    weight: 9,
    opacity: 0.35,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(mapInstance);

  // Linha principal com cor vibrante esportiva (coral/laranja atlético moderno)
  routePolylineMain = L.polyline(coords, {
    color: '#ff4d2e',
    weight: 5,
    opacity: 0.95,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(mapInstance);

  // Adiciona marcadores discretos para os waypoints intermediários para enriquecer a visualização
  if (Array.isArray(routeData.waypoints) && routeData.waypoints.length > 2) {
    // Primeiro e último são o ponto inicial
    for (let i = 1; i < routeData.waypoints.length - 1; i++) {
      const wp = routeData.waypoints[i];
      const marker = L.marker([wp.lat, wp.lng], {
        icon: createWaypointIcon(i),
        interactive: false
      }).addTo(mapInstance);
      waypointMarkers.push(marker);
    }
  }

  // Atualiza posição do marcador de início caso tenha sofrido snap
  if (routeData.start) {
    setStartPoint(routeData.start.lat, routeData.start.lng, false);
  }

  // Ajusta o zoom para enquadrar perfeitamente todo o circuito
  mapInstance.fitBounds(routePolylineMain.getBounds(), {
    padding: [45, 45],
    maxZoom: 16,
    animate: true
  });
}

/**
 * Renderiza os pontos e segmentos do modo de desenho manual
 * @param {Array<[number, number]>} pointsList 
 */
export function renderManualDraw(pointsList) {
  if (!mapInstance) return;

  clearManualLayers();

  if (!pointsList || pointsList.length === 0) return;

  // Marcadores dos pontos desenhados
  pointsList.forEach((pt, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === pointsList.length - 1 && pointsList.length > 1;

    let marker;
    if (isFirst) {
      marker = L.marker(pt, {
        icon: createStartPinIcon('Início (Manual)')
      }).addTo(mapInstance);
    } else {
      marker = L.marker(pt, {
        icon: L.divIcon({
          className: 'manual-point-node',
          html: `<div class="manual-node ${isLast ? 'manual-node-end' : ''}">${idx + 1}</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        })
      }).addTo(mapInstance);
    }
    manualMarkers.push(marker);
  });

  // Polilinha reta entre os pontos manuais
  if (pointsList.length >= 2) {
    manualPolyline = L.polyline(pointsList, {
      color: '#8b5cf6', // Roxo vibrante para diferenciar da rota automática
      dashArray: '6, 8', // Linha tracejada indicando reta/estimativa
      weight: 4,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(mapInstance);
  }
}

/**
 * Limpa camadas da rota automática gerada
 */
export function clearRouteLayers() {
  if (!mapInstance) return;

  if (routePolylineGlow) {
    mapInstance.removeLayer(routePolylineGlow);
    routePolylineGlow = null;
  }

  if (routePolylineMain) {
    mapInstance.removeLayer(routePolylineMain);
    routePolylineMain = null;
  }

  waypointMarkers.forEach(m => mapInstance.removeLayer(m));
  waypointMarkers = [];
}

/**
 * Limpa camadas do desenho manual
 */
export function clearManualLayers() {
  if (!mapInstance) return;

  manualMarkers.forEach(m => mapInstance.removeLayer(m));
  manualMarkers = [];

  if (manualPolyline) {
    mapInstance.removeLayer(manualPolyline);
    manualPolyline = null;
  }
}

/**
 * Reseta todas as rotas e marcadores adicionais mantendo o ponto de início
 */
export function clearAllRoutes() {
  clearRouteLayers();
  clearManualLayers();
}

/**
 * Centraliza o mapa nas coordenadas informadas
 * @param {number} lat 
 * @param {number} lng 
 * @param {number} [zoom] 
 */
export function setCenter(lat, lng, zoom) {
  if (!mapInstance) return;
  if (zoom) {
    mapInstance.setView([lat, lng], zoom);
  } else {
    mapInstance.panTo([lat, lng]);
  }
}
