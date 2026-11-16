import { describe, it, expect } from 'vitest';
import { inflateSync } from 'node:zlib';
import { BLANK_PNG } from '../../src/blank-tile.js';

// Read the one pixel of a 1x1 8-bit RGBA PNG: the IDAT chunk inflates to [filter byte, R, G, B, A].
function onePixel(png) {
  const buf = Buffer.from(png);
  const i = buf.indexOf('IDAT');
  const len = buf.readUInt32BE(i - 4);
  const raw = inflateSync(buf.subarray(i + 4, i + 4 + len));
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25], rgba: [...raw.subarray(1, 5)] };
}

describe('blank tile for photo pieces a county file does not have', () => {
  it('is a 1x1 RGBA pixel that is fully transparent, so nothing shows over the map', () => {
    const p = onePixel(BLANK_PNG);
    expect([p.width, p.height, p.colorType]).toEqual([1, 1, 6]);
    expect(p.rgba[3]).toBe(0);
  });
});
