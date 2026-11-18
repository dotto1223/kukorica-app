import 'leaflet/dist/leaflet.css';
import './styles.css';
import L from 'leaflet';
window.loadVectorLabels=()=>import('./labels-vector.js');
import proj4 from 'proj4';
import * as GeoTIFF from 'geotiff';
import { PMTiles } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import { startApp } from 'virtual:app';
import { initI18n } from './i18n.js';

Object.assign(window, { L, proj4, GeoTIFF, VT: { PMTiles, VectorTile, Pbf } });
initI18n().finally(() => startApp());
