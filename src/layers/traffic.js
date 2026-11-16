import { FONTS } from '../style/build.js';

/**
 * The traffic-control layer: what generic basemaps leave out and a traffic engineer looks for first. Built from
 * OpenStreetMap by schema/traffic.yml into data/traffic.pmtiles (layers: control, streets, transit).
 *
 * Icons are drawn on a canvas from the map tokens (no sprite sheet), so each style variant gets its own colours.
 * Their names are tc-<kind>-<variant>; installTrafficIcons answers MapLibre's "styleimagemissing" for them, which
 * also covers a Night/Day/Plan swap that clears the images.
 */

// Each icon: the token slots it uses and how to draw it on a size x size canvas (size is in device pixels).
export const TRAFFIC_ICONS = {
  traffic_signals: {
    slots: ['tc-signal', 'tc-lamp-red', 'tc-lamp-amber', 'tc-lamp-green', 'tc-white'],
    draw(g, s, c) {
      const w = s * 0.42, h = s * 0.9, x = (s - w) / 2, y = (s - h) / 2;
      round(g, x, y, w, h, w * 0.35); g.fillStyle = c['tc-signal']; g.fill();
      g.lineWidth = s * 0.05; g.strokeStyle = c['tc-white']; g.globalAlpha = 0.55; g.stroke(); g.globalAlpha = 1;
      [c['tc-lamp-red'], c['tc-lamp-amber'], c['tc-lamp-green']].forEach((col, i) => {
        g.beginPath(); g.arc(s / 2, y + h * (0.2 + 0.3 * i), w * 0.3, 0, Math.PI * 2); g.fillStyle = col; g.fill();
      });
    },
  },
  stop: {
    slots: ['tc-stop', 'tc-white'],
    draw(g, s, c) {
      const r = s * 0.46, cx = s / 2;
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = Math.PI / 8 + (i * Math.PI) / 4;
        g.lineTo(cx + r * Math.cos(a), cx + r * Math.sin(a));
      }
      g.closePath(); g.fillStyle = c['tc-stop']; g.fill();
      g.lineWidth = s * 0.07; g.strokeStyle = c['tc-white']; g.stroke();
      g.fillStyle = c['tc-white']; g.fillRect(s * 0.26, s * 0.44, s * 0.48, s * 0.12);
    },
  },
  give_way: {
    slots: ['tc-stop', 'tc-white'],
    draw(g, s, c) {
      g.beginPath(); g.moveTo(s * 0.06, s * 0.12); g.lineTo(s * 0.94, s * 0.12); g.lineTo(s / 2, s * 0.9); g.closePath();
      g.fillStyle = c['tc-white']; g.fill(); g.lineJoin = 'round'; g.lineWidth = s * 0.12; g.strokeStyle = c['tc-stop']; g.stroke();
    },
  },
  crossing: {
    slots: ['tc-signal', 'tc-crossing'],
    draw(g, s, c) {
      round(g, s * 0.1, s * 0.1, s * 0.8, s * 0.8, s * 0.18); g.fillStyle = c['tc-signal']; g.fill();
      g.fillStyle = c['tc-crossing'];
      for (let i = 0; i < 4; i++) g.fillRect(s * (0.2 + i * 0.165), s * 0.24, s * 0.09, s * 0.52);
    },
  },
  level_crossing: {
    slots: ['tc-signal', 'tc-white'],
    draw(g, s, c) {
      g.lineCap = 'round';
      for (const [col, w] of [[c['tc-signal'], 0.24], [c['tc-white'], 0.12]]) {
        g.strokeStyle = col; g.lineWidth = s * w; g.beginPath();
        g.moveTo(s * 0.18, s * 0.18); g.lineTo(s * 0.82, s * 0.82); g.moveTo(s * 0.82, s * 0.18); g.lineTo(s * 0.18, s * 0.82);
        g.stroke();
      }
    },
  },
  mini_roundabout: {
    slots: ['tc-signal', 'tc-white'],
    draw(g, s, c) {
      g.beginPath(); g.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2); g.fillStyle = c['tc-signal']; g.fill();
      g.lineWidth = s * 0.1; g.strokeStyle = c['tc-white']; g.beginPath(); g.arc(s / 2, s / 2, s * 0.22, 0, Math.PI * 2); g.stroke();
    },
  },
  bus: {
    slots: ['tc-bus', 'tc-white'],
    draw(g, s, c) {
      round(g, s * 0.1, s * 0.1, s * 0.8, s * 0.8, s * 0.2); g.fillStyle = c['tc-bus']; g.fill();
      g.fillStyle = c['tc-white'];
      round(g, s * 0.27, s * 0.24, s * 0.46, s * 0.44, s * 0.08); g.fill();
      g.fillStyle = c['tc-bus']; g.fillRect(s * 0.32, s * 0.3, s * 0.36, s * 0.16);
      g.fillStyle = c['tc-white'];
      g.fillRect(s * 0.3, s * 0.68, s * 0.1, s * 0.08); g.fillRect(s * 0.6, s * 0.68, s * 0.1, s * 0.08);
    },
  },
};
const CONTROL_KINDS = ['traffic_signals', 'stop', 'give_way', 'crossing', 'mini_roundabout', 'level_crossing'];

function round(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** Draw icons on demand. Call once per map, with the same tokens the style was built from. */
export function installTrafficIcons(map, tokens) {
  map.on('styleimagemissing', ({ id }) => {
    const m = /^tc-(.+)-(night|day|plan)$/.exec(id);
    const icon = m && TRAFFIC_ICONS[m[1]];
    if (!icon || map.hasImage(id)) return;
    const c = Object.fromEntries(icon.slots.map((s) => [s, tokens[`--map-${m[2]}-${s}`]]));
    const ratio = 2, size = 22 * ratio;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d');
    icon.draw(g, size, c);
    map.addImage(id, g.getImageData(0, 0, size, size), { pixelRatio: ratio });
  });
}

/**
 * The layer spec for addDataLayer.
 * @param {Record<string,string>} tokens  from readTokens()
 * @param {'night'|'day'|'plan'} variant
 * @param {string} url  full pmtiles:// URL of traffic.pmtiles
 */
export function trafficLayer(tokens, variant, url) {
  const t = (slot) => tokens[`--map-${variant}-${slot}`];
  const icon = (kind) => `tc-${kind}-${variant}`;
  const SRC = 'traffic';
  const bikeTrack = ['any', ['==', ['get', 'highway'], 'cycleway'], ['in', ['get', 'cycleway'], ['literal', ['track', 'separate']]]];
  const bikeLane = ['in', ['get', 'cycleway'], ['literal', ['lane', 'buffered_lane', 'shared_lane', 'share_busway']]];
  const lanes = ['to-string', ['get', 'lanes']];
  return {
    id: SRC, name: 'Traffic control', group: 'data', visible: true, opacity: 1,
    source: { type: 'vector', url, attribution: '© OpenStreetMap contributors' },
    layers: [
      { id: 'traffic-bike', type: 'line', source: SRC, 'source-layer': 'streets', minzoom: 13, filter: bikeTrack,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': t('tc-bike'), 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1, 16, 2, 19, 4],
          'line-opacity': 0.9 } },
      { id: 'traffic-bike-lane', type: 'line', source: SRC, 'source-layer': 'streets', minzoom: 14, filter: bikeLane,
        paint: { 'line-color': t('tc-bike'), 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1, 16, 1.6, 19, 3],
          'line-dasharray': [2, 2], 'line-opacity': 0.9,
          'line-offset': ['interpolate', ['exponential', 1.6], ['zoom'], 14, 2, 17, 6, 20, 30] } },
      { id: 'traffic-lanes-label', type: 'symbol', source: SRC, 'source-layer': 'streets', minzoom: 16,
        filter: ['any', ['has', 'lanes'], ['has', 'maxspeed']],
        layout: {
          'symbol-placement': 'line', 'symbol-spacing': 420, 'text-font': [FONTS.regular],
          'text-size': ['interpolate', ['linear'], ['zoom'], 16, 10.5, 19, 13],
          'text-offset': [0, 1.15], 'text-letter-spacing': 0.02,
          'text-field': ['case',
            ['all', ['has', 'lanes'], ['has', 'maxspeed']], ['concat', lanes, ' lanes · ', ['get', 'maxspeed']],
            ['has', 'lanes'], ['concat', lanes, ' lanes'],
            ['get', 'maxspeed']],
        },
        paint: { 'text-color': t('tc-label'), 'text-halo-color': t('label-halo'), 'text-halo-width': 1.6 } },
      { id: 'traffic-control', type: 'symbol', source: SRC, 'source-layer': 'control', minzoom: 15,
        layout: {
          'icon-image': ['concat', 'tc-',
            ['match', ['get', 'kind'], CONTROL_KINDS, ['get', 'kind'], 'crossing'], `-${variant}`],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.62, 17, 0.85, 19, 1.1],
          // Signals and signs win over crosswalks when space is short.
          'symbol-sort-key': ['match', ['get', 'kind'], 'traffic_signals', 0, 'stop', 1, 'give_way', 1, 2],
          'icon-padding': 1,
          'icon-allow-overlap': ['step', ['zoom'], false, 18, true],
        } },
      { id: 'traffic-bus', type: 'symbol', source: SRC, 'source-layer': 'transit', minzoom: 16,
        layout: { 'icon-image': icon('bus'), 'icon-size': ['interpolate', ['linear'], ['zoom'], 16, 0.7, 19, 1] } },
    ],
  };
}
