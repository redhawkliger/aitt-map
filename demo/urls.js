/**
 * A data address from a demo link parameter (?basemap=, ?photos=). The published demo only follows addresses on its
 * own site, so a crafted link can't show someone else's map data under our domain; local development allows any.
 * @param {string|null} param  the link parameter, if any
 * @param {string} fallback    the address to use otherwise
 * @param {{dev: boolean, origin: string}} env
 */
export function dataUrl(param, fallback, { dev, origin }) {
  if (!param) return fallback;
  if (dev) return param;
  try { return new URL(param, origin).origin === origin ? param : fallback; } catch { return fallback; }
}
