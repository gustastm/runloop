/**
 * RunLoop — Módulo de Gerenciamento do Mapa (Leaflet)
 * 
 * Mapa em tela cheia mobile-first, tema escuro via filtro CSS (config.js),
 * ponto 'você' em azul com pulso e círculo de precisão, centralização inteligente
 * considerando a área útil da tela, traçado live de corrida e casing elegante nas rotas.
 */

import { CONFIG } from './config.js';

let mapInstance = null;
let startMarker = null;
let endMarker = null;
let currentStartPoint = null;
let currentEndPoint = null;
let markersDraggable = false;
let onMarkerDragEndCallback = null;
let onMapDragStartCallback = null;

let userMarker = null;
let accuracyCircle = null;
let routePolylineCasing = null;
let routePolylineMain = null;
let waypointMarkers = [];
let manualMarkers = [];
let manualPolyline = null;

let liveRunCasing = null;
let liveRunMain = null;

// Callback para cliques no mapa
let onMapClickCallback = null;

/**
 * Cria o ícone SVG customizado para o ponto de partida / chegada
 * @param {string} label 
 * @returns {L.DivIcon}
 */
export function createStartPinIcon(label = 'Início') {
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
 * Cria o ícone SVG customizado para o ponto de chegada (Fim)
 * @param {string} label 
 * @returns {L.DivIcon}
 */
export function createEndPinIcon(label = 'Fim') {
  return L.divIcon({
    className: 'runloop-marker-container',
    html: `
      <div class="runloop-start-pin runloop-end-pin" title="${label}">
        <div class="pin-pulse pin-pulse-end"></div>
        <div class="pin-badge pin-badge-end">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="m9 12 2 2 4-4"></path>
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
 * Cria o ícone do ponto azul 'você' com pulso suave
 * @returns {L.DivIcon}
 */
function createUserLocationIcon() {
  return L.divIcon({
    className: 'runloop-user-marker-wrap',
    html: `
      <div class="user-pulse-ring"></div>
      <div class="user-location-dot"></div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
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

/**
 * Inicializa a instância do Leaflet
 * @param {string} containerId - ID do container do mapa
 * @param {object} initialView - { lat, lng, zoom }
 * @returns {L.Map}
 */
export function initMap(containerId = 'map', initialView = CONFIG.DEFAULT_MAP_VIEW) {
  if (mapInstance) {
    mapInstance.remove();
  }

  mapInstance = L.map(containerId, {
    zoomControl: false, // Controle customizado / desktop
    attributionControl: true
  }).setView([initialView.lat, initialView.lng], initialView.zoom);

  // Controle de zoom exclusivo para desktop com mouse (pointer: fine)
  L.control.zoom({ position: 'topright' }).addTo(mapInstance);

  // Camada padrão do OpenStreetMap
  const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> colaboradores'
  }).addTo(mapInstance);

  // Aplica o filtro de tema escuro configurado em config.js no tile pane
  if (CONFIG.MAP_DARK_FILTER) {
    const tilePane = mapInstance.getPane('tilePane');
    if (tilePane) {
      tilePane.style.filter = CONFIG.MAP_DARK_FILTER;
    }
  }

  // Escuta cliques no mapa
  mapInstance.on('click', (e) => {
    if (typeof onMapClickCallback === 'function') {
      onMapClickCallback({
        lat: Number(e.latlng.lat.toFixed(6)),
        lng: Number(e.latlng.lng.toFixed(6))
      });
    }
  });

  // Pausa seguimento da corrida quando o usuário arrasta manualmente o mapa
  mapInstance.on('dragstart', () => {
    if (typeof onMapDragStartCallback === 'function') {
      onMapDragStartCallback();
    }
  });

  return mapInstance;
}

export function getMapInstance() {
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
 * Atualiza o marcador do ponto 'você' e círculo de precisão
 * @param {number} lat 
 * @param {number} lng 
 * @param {number} [accuracy=10] 
 */
export function updateUserMarker(lat, lng, accuracy = 10) {
  if (!mapInstance) return;

  const latlng = [lat, lng];

  if (!userMarker) {
    userMarker = L.marker(latlng, {
      icon: createUserLocationIcon(),
      interactive: false,
      zIndexOffset: 1000
    }).addTo(mapInstance);
  } else {
    userMarker.setLatLng(latlng);
  }

  if (accuracy && accuracy > 0) {
    if (!accuracyCircle) {
      accuracyCircle = L.circle(latlng, {
        radius: accuracy,
        color: '#06b6d4',
        weight: 1,
        opacity: 0.4,
        fillColor: '#06b6d4',
        fillOpacity: 0.08,
        interactive: false
      }).addTo(mapInstance);
    } else {
      accuracyCircle.setLatLng(latlng);
      accuracyCircle.setRadius(accuracy);
    }
  }
}

/**
 * Centraliza suavemente no usuário com compensação de offset vertical
 * (garante que o ponto fique na metade superior livre da tela, acima do dock/sheet)
 * @param {number} lat 
 * @param {number} lng 
 * @param {object} [options]
 * @param {number} [options.zoom=16]
 * @param {number} [options.duration=1.6]
 * @param {number} [options.bottomOffsetPx=140]
 */
export function flyToUserLocation(lat, lng, options = {}) {
  if (!mapInstance) return;

  const zoom = options.zoom || CONFIG.TRACKER.FLY_TO_ZOOM || 16;
  const duration = options.duration || CONFIG.TRACKER.FLY_TO_DURATION || 1.6;
  const bottomOffsetPx = options.bottomOffsetPx ?? (window.innerWidth < 900 ? 120 : 0);

  // Calcula coordenadas offset projetadas para manter o ponto centralizado na área livre
  const centerPoint = mapInstance.project([lat, lng], zoom);
  const targetPoint = centerPoint.add([0, bottomOffsetPx / 2]);
  const targetLatLng = mapInstance.unproject(targetPoint, zoom);

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion) {
    mapInstance.setView(targetLatLng, zoom);
  } else {
    mapInstance.flyTo(targetLatLng, zoom, {
      duration,
      easeLinearity: 0.25
    });
  }
}

/**
 * Atualiza os rótulos visuais dos marcadores:
 * - Se só houver Início: 'Início / Fim'
 * - Se houver Início e Fim: 'Início' e 'Fim'
 */
export function updateMarkerLabels() {
  if (!startMarker) return;
  if (endMarker) {
    startMarker.setIcon(createStartPinIcon('Início'));
    endMarker.setIcon(createEndPinIcon('Fim'));
  } else {
    startMarker.setIcon(createStartPinIcon('Início / Fim'));
  }
}

/**
 * Define ou move o marcador de início
 * @param {number} lat 
 * @param {number} lng 
 * @param {boolean} [pan=false] - se deve centralizar a visão do mapa
 */
export function setStartPoint(lat, lng, pan = false) {
  if (!mapInstance) return;

  const latNum = Number(lat.toFixed(6));
  const lngNum = Number(lng.toFixed(6));
  const latlng = [latNum, lngNum];

  currentStartPoint = { lat: latNum, lng: lngNum };
  const label = currentEndPoint ? 'Início' : 'Início / Fim';

  if (!startMarker) {
    startMarker = L.marker(latlng, {
      icon: createStartPinIcon(label),
      draggable: markersDraggable
    }).addTo(mapInstance);

    startMarker.on('dragend', (e) => {
      const pos = e.target.getLatLng();
      const updatedLat = Number(pos.lat.toFixed(6));
      const updatedLng = Number(pos.lng.toFixed(6));
      currentStartPoint = { lat: updatedLat, lng: updatedLng };

      if (typeof onMarkerDragEndCallback === 'function') {
        onMarkerDragEndCallback('start', currentStartPoint);
      }
    });
  } else {
    startMarker.setLatLng(latlng);
    startMarker.setIcon(createStartPinIcon(label));
  }

  if (pan) {
    flyToUserLocation(latNum, lngNum, { zoom: 16, bottomOffsetPx: 120 });
  }
}

/**
 * Define ou move o marcador de fim
 * @param {number} lat 
 * @param {number} lng 
 * @param {boolean} [pan=false]
 */
export function setEndPoint(lat, lng, pan = false) {
  if (!mapInstance) return;

  const latNum = Number(lat.toFixed(6));
  const lngNum = Number(lng.toFixed(6));
  const latlng = [latNum, lngNum];

  currentEndPoint = { lat: latNum, lng: lngNum };

  if (!endMarker) {
    endMarker = L.marker(latlng, {
      icon: createEndPinIcon('Fim'),
      draggable: markersDraggable
    }).addTo(mapInstance);

    endMarker.on('dragend', (e) => {
      const pos = e.target.getLatLng();
      const updatedLat = Number(pos.lat.toFixed(6));
      const updatedLng = Number(pos.lng.toFixed(6));
      currentEndPoint = { lat: updatedLat, lng: updatedLng };

      if (typeof onMarkerDragEndCallback === 'function') {
        onMarkerDragEndCallback('end', currentEndPoint);
      }
    });
  } else {
    endMarker.setLatLng(latlng);
    endMarker.setIcon(createEndPinIcon('Fim'));
  }

  updateMarkerLabels();

  if (pan) {
    flyToUserLocation(latNum, lngNum, { zoom: 16, bottomOffsetPx: 120 });
  }
}

export function removeEndPoint() {
  if (endMarker && mapInstance) {
    mapInstance.removeLayer(endMarker);
    endMarker = null;
  }
  currentEndPoint = null;
  updateMarkerLabels();
}

export function getStartPoint() {
  return currentStartPoint ? { ...currentStartPoint } : null;
}

export function hasStartPoint() {
  return currentStartPoint !== null;
}

export function getEndPoint() {
  return currentEndPoint ? { ...currentEndPoint } : null;
}

export function hasEndPoint() {
  return currentEndPoint !== null;
}

/**
 * Ativa ou desativa a capacidade de arrastar os marcadores de início e fim
 * @param {boolean} isDraggable 
 */
export function setMarkersDraggable(isDraggable) {
  markersDraggable = isDraggable;
  if (startMarker && startMarker.dragging) {
    if (isDraggable) startMarker.dragging.enable();
    else startMarker.dragging.disable();
  }
  if (endMarker && endMarker.dragging) {
    if (isDraggable) endMarker.dragging.enable();
    else endMarker.dragging.disable();
  }
}

export function setMarkerDragEndHandler(callback) {
  onMarkerDragEndCallback = callback;
}

export function setMapDragStartHandler(callback) {
  onMapDragStartCallback = callback;
}

export function panToRunner(lat, lng) {
  if (!mapInstance) return;
  mapInstance.panTo([lat, lng], { animate: true, duration: 0.5 });
}

/**
 * Renderiza uma rota circular automática no mapa com contorno (casing) esportivo
 * @param {object} routeData 
 * @param {object} [paddingOptions] - { top: number, bottom: number }
 */
export function renderRoute(routeData, paddingOptions = {}) {
  if (!mapInstance || !routeData || !routeData.coordinates) return;

  clearRouteLayers();

  const coords = routeData.coordinates;

  // 1. Contorno externo escuro/branco (casing de alta legibilidade)
  routePolylineCasing = L.polyline(coords, {
    color: '#0b0f19',
    weight: 9,
    opacity: 0.85,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(mapInstance);

  // 2. Traço principal coral atlético
  routePolylineMain = L.polyline(coords, {
    color: '#ff4d2e',
    weight: 5,
    opacity: 1,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(mapInstance);

  // Waypoints intermediários
  if (Array.isArray(routeData.waypoints) && routeData.waypoints.length > 2) {
    for (let i = 1; i < routeData.waypoints.length - 1; i++) {
      const wp = routeData.waypoints[i];
      const marker = L.marker([wp.lat, wp.lng], {
        icon: createWaypointIcon(i),
        interactive: false
      }).addTo(mapInstance);
      waypointMarkers.push(marker);
    }
  }

  // Atualiza marcadores de início e fim
  if (routeData.start) {
    setStartPoint(routeData.start.lat, routeData.start.lng, false);
  }
  if (routeData.end) {
    setEndPoint(routeData.end.lat, routeData.end.lng, false);
  }

  // Enquadra a rota considerando a barra superior e o bottom sheet compacto
  fitRouteBounds(routePolylineMain.getBounds(), paddingOptions);
}

/**
 * Enquadra os limites da rota considerando as áreas ocupadas da interface
 * @param {L.LatLngBounds} bounds 
 * @param {object} [padding] - { top, bottom }
 */
export function fitRouteBounds(bounds, padding = {}) {
  if (!mapInstance || !bounds) return;

  const isMobile = window.innerWidth < 900;
  const topPad = padding.top ?? (isMobile ? 85 : 40);
  const bottomPad = padding.bottom ?? (isMobile ? 220 : 100);

  mapInstance.fitBounds(bounds, {
    paddingTopLeft: [28, topPad],
    paddingBottomRight: [28, bottomPad],
    maxZoom: 16,
    animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  });
}

/**
 * Renderiza o traçado da corrida em andamento (cor ciano contrastante com casing)
 * @param {Array<[number, number]>} coordinates 
 */
export function updateLiveRunTrail(coordinates) {
  if (!mapInstance || !coordinates || coordinates.length === 0) return;

  if (!liveRunCasing) {
    liveRunCasing = L.polyline(coordinates, {
      color: '#0b0f19',
      weight: 8,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(mapInstance);
  } else {
    liveRunCasing.setLatLngs(coordinates);
  }

  if (!liveRunMain) {
    liveRunMain = L.polyline(coordinates, {
      color: '#06b6d4', // Ciano elétrico vivo para diferenciar da rota coral planejada
      weight: 5,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(mapInstance);
  } else {
    liveRunMain.setLatLngs(coordinates);
  }
}

export function clearLiveRunTrail() {
  if (!mapInstance) return;
  if (liveRunCasing) {
    mapInstance.removeLayer(liveRunCasing);
    liveRunCasing = null;
  }
  if (liveRunMain) {
    mapInstance.removeLayer(liveRunMain);
    liveRunMain = null;
  }
}

/**
 * Renderiza os pontos e segmentos do modo de desenho manual
 * @param {Array<[number, number]>} pointsList 
 */
export function renderManualDraw(pointsList) {
  if (!mapInstance) return;

  clearManualLayers();
  if (!pointsList || pointsList.length === 0) return;

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

  if (pointsList.length >= 2) {
    manualPolyline = L.polyline(pointsList, {
      color: '#a855f7',
      dashArray: '6, 8',
      weight: 4,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(mapInstance);
  }
}

export function clearRouteLayers() {
  if (!mapInstance) return;

  if (routePolylineCasing) {
    mapInstance.removeLayer(routePolylineCasing);
    routePolylineCasing = null;
  }
  if (routePolylineMain) {
    mapInstance.removeLayer(routePolylineMain);
    routePolylineMain = null;
  }
  waypointMarkers.forEach(m => mapInstance.removeLayer(m));
  waypointMarkers = [];
}

export function clearManualLayers() {
  if (!mapInstance) return;
  manualMarkers.forEach(m => mapInstance.removeLayer(m));
  manualMarkers = [];
  if (manualPolyline) {
    mapInstance.removeLayer(manualPolyline);
    manualPolyline = null;
  }
}

export function clearAllRoutes() {
  clearRouteLayers();
  clearManualLayers();
  clearLiveRunTrail();
}
