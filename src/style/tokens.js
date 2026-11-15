import { MAP_SLOTS, VARIANTS } from './build.js';

/** Read the map tokens (CSS variables from src/theme/map-tokens.css) into a plain object. */
export function readTokens(el = document.documentElement) {
  const cs = getComputedStyle(el);
  const out = {};
  for (const v of VARIANTS) for (const s of MAP_SLOTS) {
    const name = `--map-${v}-${s}`;
    const value = cs.getPropertyValue(name).trim();
    if (!value) throw new Error(`Missing map token ${name}: import src/theme/map-tokens.css`);
    out[name] = value.toLowerCase();
  }
  return out;
}
