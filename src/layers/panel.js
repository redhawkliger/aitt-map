import { listLayers, setLayerVisible, setLayerOpacity, setBasemapVariant, basemapVariant } from './registry.js';
import { VARIANTS } from '../style/build.js';

const GROUP_NAMES = { basemap: 'Basemap', imagery: 'Imagery', data: 'Data' };
const VARIANT_NAMES = { night: 'Night', day: 'Day', plan: 'Plan', neon: 'Neon', matrix: 'Matrix', ember: 'Ember', cyber: 'Cyber', report: 'Report', blocks: 'Blocks' };

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v !== undefined) el.setAttribute(k, v);
  }
  el.append(...kids);
  return el;
}

/**
 * One panel for the map: the style and every registered layer, grouped, each with a switch and,
 * while on, an opacity slider. Below 640 px wide it folds into a "Layers" button.
 * @param {import('maplibre-gl').Map} map
 * @param {HTMLElement} el  where the panel goes (usually a child of the map container)
 */
export function mountLayerPanel(map, el) {
  el.classList.add('aitt-layer-panel');
  const toggle = h('button', { type: 'button', class: 'aitt-layer-toggle', 'aria-expanded': 'false',
    onclick: () => {
      const open = el.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    } }, 'Layers');
  const body = h('div', { class: 'aitt-layer-body' });
  el.replaceChildren(toggle, body);

  function render() {
    const kids = [];
    const variant = basemapVariant(map);
    if (variant) {
      kids.push(h('div', { class: 'aitt-layer-group', role: 'radiogroup', 'aria-label': 'Map style' },
        h('div', { class: 'aitt-layer-group-name' }, 'Style'),
        h('div', { class: 'aitt-seg' }, ...VARIANTS.map((v) => h('button', {
          type: 'button', role: 'radio', 'aria-checked': String(v === variant), class: 'aitt-seg-btn', 'data-focus': `variant:${v}`,
          onclick: () => { if (v !== basemapVariant(map)) setBasemapVariant(map, v); },
        }, VARIANT_NAMES[v])))));
    }
    const layers = listLayers(map);
    for (const g of Object.keys(GROUP_NAMES)) {
      const rows = layers.filter((l) => l.group === g);
      if (!rows.length) continue;
      kids.push(h('div', { class: 'aitt-layer-group' },
        h('div', { class: 'aitt-layer-group-name' }, GROUP_NAMES[g]),
        ...rows.map((l) => h('div', { class: 'aitt-layer-row' },
          h('label', { class: 'aitt-layer-line' },
            h('span', { class: 'aitt-layer-name' }, l.name),
            h('input', { type: 'checkbox', role: 'switch', class: 'aitt-switch', 'aria-label': l.name, checked: l.visible, 'data-focus': `switch:${l.id}`,
              onchange: (e) => setLayerVisible(map, l.id, e.target.checked) })),
          l.visible ? h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(l.opacity),
            class: 'aitt-opacity', 'aria-label': `${l.name} opacity`, 'data-focus': `opacity:${l.id}`,
            oninput: (e) => setLayerOpacity(map, l.id, Number(e.target.value)) }) : ''))));
    }
    // Keep the slider being dragged: only rebuild when the set of rows or their on/off state changes.
    const key = JSON.stringify([variant, layers.map((l) => [l.id, l.visible])]);
    if (key !== body.dataset.key) {
      // Keyboard and screen-reader users keep their place: refocus the same control after the rebuild.
      const focused = body.contains(document.activeElement) ? document.activeElement.dataset.focus : undefined;
      body.dataset.key = key;
      body.replaceChildren(...kids);
      if (focused) body.querySelector(`[data-focus="${CSS.escape(focused)}"]`)?.focus();
    }
  }
  map.on('aitt:layers', render);
  render();
}
