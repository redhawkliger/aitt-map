// A fully transparent 1x1 PNG. For a raster tile the file does not have (photos cover only the corridor), pmtiles
// answers {data: null}, which leaves MapLibre waiting forever, so the map never reports "loaded". A blank tile ends
// the wait. It must be transparent: each county file claims a whole rectangle, and these tiles fill the gaps in it.
export const BLANK_PNG = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGBgAAAABQABeqhXUAAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
