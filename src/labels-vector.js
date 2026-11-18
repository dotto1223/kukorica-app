// Vektoros feliratréteg a műholdkép fölé (OpenFreeMap / OpenMapTiles séma, OpenStreetMap adatok).
// Minden név egyszer, sötét kontúrral; a kisebb tájnevek, vízfolyások csak nagyításkor.
import 'maplibre-gl/dist/maplibre-gl.css';
import L from 'leaflet';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
setWorkerUrl(workerUrl);
import '@maplibre/maplibre-gl-leaflet';

const F_REG = ['Noto Sans Regular'], F_BOLD = ['Noto Sans Bold'], F_IT = ['Noto Sans Italic'];
const HALO = 'rgba(15,20,15,0.9)';
const NAME = ['coalesce', ['get', 'name'], ['get', 'name:latin']];

function sym(id, layer, filter, minzoom, size, color, extra = {}) {
  const o = {
    id, type: 'symbol', source: 'omt', 'source-layer': layer, minzoom,
    layout: Object.assign({
      'text-field': NAME, 'text-font': F_REG, 'text-size': size,
      'text-max-width': 8, 'text-padding': 4, 'symbol-sort-key': 0
    }, extra.layout || {}),
    paint: Object.assign({ 'text-color': color, 'text-halo-color': HALO, 'text-halo-width': 1.6, 'text-halo-blur': 0.4 }, extra.paint || {})
  };
  if (filter) o.filter = filter;
  return o;
}

export function labelStyle() {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: { omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '© OpenStreetMap, OpenFreeMap' } },
    layers: [
      // megyehatár (és országhatár) halványan
      { id: 'bnd', type: 'line', source: 'omt', 'source-layer': 'boundary', filter: ['all', ['<=', ['get', 'admin_level'], 6], ['!=', ['get', 'maritime'], 1]],
        paint: { 'line-color': 'rgba(255,255,255,0.75)', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 12, 1.6], 'line-dasharray': [3, 2] } },
      // kisebb vízfolyások, csatornák vonala csak közelről (a műholdképen sokszor nem látszanak)
      { id: 'ww-line', type: 'line', source: 'omt', 'source-layer': 'waterway', minzoom: 13,
        filter: ['in', ['get', 'class'], ['literal', ['stream', 'canal', 'ditch', 'drain']]],
        paint: { 'line-color': 'rgba(120,190,255,0.75)', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.8, 17, 2.2] } },
      // utak: autópálya/főút messziről, mellékutak közepes, dűlőutak csak közelről; áttetszők, hogy a műholdkép látsszon
      { id: 'rd-track', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 14,
        filter: ['in', ['get', 'class'], ['literal', ['track', 'path']]],
        paint: { 'line-color': 'rgba(240,220,170,0.6)', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.8, 18, 2], 'line-dasharray': [3, 2] } },
      { id: 'rd-minor', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 12,
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary']]],
        paint: { 'line-color': 'rgba(255,255,255,0.55)', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.7, 18, 3] } },
      { id: 'rd-secondary', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 9,
        filter: ['==', ['get', 'class'], 'secondary'],
        paint: { 'line-color': 'rgba(255,240,180,0.75)', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.8, 18, 4] } },
      { id: 'rd-primary', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 7,
        filter: ['in', ['get', 'class'], ['literal', ['primary', 'trunk']]],
        paint: { 'line-color': 'rgba(255,214,102,0.85)', 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1, 18, 5] } },
      { id: 'rd-motorway', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 6,
        filter: ['==', ['get', 'class'], 'motorway'],
        paint: { 'line-color': 'rgba(255,150,70,0.9)', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1.2, 18, 6] } },
      // útszámok (M5, 51, 52…) és utcanevek
      sym('rd-ref-major', 'transportation_name', ['all', ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]], ['has', 'ref']], 8, 12, '#ffe6a8',
        { layout: { 'text-field': ['get', 'ref'], 'text-font': F_BOLD, 'symbol-placement': 'line', 'symbol-spacing': 350, 'text-rotation-alignment': 'viewport' } }),
      sym('rd-ref-sec', 'transportation_name', ['all', ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary']]], ['has', 'ref']], 11, 11.5, '#fff3cf',
        { layout: { 'text-field': ['get', 'ref'], 'text-font': F_BOLD, 'symbol-placement': 'line', 'symbol-spacing': 350, 'text-rotation-alignment': 'viewport' } }),
      sym('rd-name', 'transportation_name', ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary', 'minor', 'track']]], 15, 11.5, '#f4f4f4',
        { layout: { 'symbol-placement': 'line', 'symbol-spacing': 300 } }),
      // vízfolyások nevei: folyó közepes nagyításon, ér/csatorna csak közelről
      sym('ww-river', 'waterway', ['==', ['get', 'class'], 'river'], 9, 12.5, '#bfe3ff',
        { layout: { 'symbol-placement': 'line', 'text-font': F_IT, 'symbol-spacing': 400, 'text-letter-spacing': 0.08 } }),
      sym('ww-small', 'waterway', ['in', ['get', 'class'], ['literal', ['stream', 'canal', 'ditch', 'drain']]], 13, 12.5, '#bfe3ff',
        { layout: { 'symbol-placement': 'line', 'text-font': F_IT, 'symbol-spacing': 450, 'text-letter-spacing': 0.06 } }),
      sym('water', 'water_name', null, 11, 12.5, '#bfe3ff', { layout: { 'text-font': F_IT } }),
      // nemzeti park, védett terület, erdő nevei
      sym('park', 'park', null, 10, 12, '#c8f0b0', { layout: { 'text-font': F_IT, 'text-padding': 120 } }),
      // puszta, tanya, dűlő, határrész – csak közelről
      sym('loc', 'place', ['in', ['get', 'class'], ['literal', ['hamlet', 'isolated_dwelling', 'locality', 'neighbourhood', 'farm']]], 13, 12.5, '#fff1b8',
        { layout: { 'text-font': F_IT } }),
      // falvak
      sym('village', 'place', ['==', ['get', 'class'], 'village'], 9, ['interpolate', ['linear'], ['zoom'], 9, 11.5, 14, 14], '#ffffff',
        { layout: { 'symbol-sort-key': 2 } }),
      // városok
      sym('town', 'place', ['==', ['get', 'class'], 'town'], 7, ['interpolate', ['linear'], ['zoom'], 7, 12.5, 14, 16], '#ffffff',
        { layout: { 'text-font': F_BOLD, 'symbol-sort-key': 1 } }),
      sym('city', 'place', ['==', ['get', 'class'], 'city'], 5, ['interpolate', ['linear'], ['zoom'], 5, 13, 14, 19], '#ffffff',
        { layout: { 'text-font': F_BOLD, 'symbol-sort-key': 0 } })
    ]
  };
}

export function makeLabelLayer(pane) {
  if (!L.maplibreGL) throw new Error('maplibre-gl-leaflet not loaded');
  const ly = L.maplibreGL({ style: labelStyle(), pane, interactive: false, attributionControl: false, attribution: '© OpenStreetMap, OpenFreeMap' });
  ly.getAttribution = () => '© OpenStreetMap, OpenFreeMap';
  return ly;
}
