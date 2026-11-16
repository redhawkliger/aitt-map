"""Build MapLibre glyph PBFs (signed-distance-field font ranges) from TTF files.

Usage: python scripts/build-glyphs.py fonts-src public/fonts
Each fonts-src/Overpass-<Style>.ttf becomes public/fonts/Overpass <Style>/<start>-<end>.pbf for all 256 ranges.

Same format and metrics as node-fontnik / sdf_glyph_renderer (what MapLibre expects): 24 px em, 3 px buffer,
8 px SDF radius, edge at 0.75 (byte 191), glyph top = bearingY - ascender. Glyphs are rendered at 4x, the
distance transform runs on the large bitmap, then it is sampled down, which keeps edges smooth.
Needs: freetype-py, numpy, scipy (no compiler, no admin rights).
"""
import sys
from pathlib import Path

import freetype
import numpy as np
from scipy.ndimage import distance_transform_edt

SIZE, BUFFER, RADIUS, CUTOFF, SCALE = 24, 3, 8, 0.25, 4


def varint(n):
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def zigzag(n):
    return (n << 1) ^ (n >> 31)


def field(num, wire, payload):
    key = varint((num << 3) | wire)
    if wire == 0:
        return key + varint(payload)
    return key + varint(len(payload)) + payload


def glyph_msg(g):
    return (field(1, 0, g['id']) + (field(2, 2, g['bitmap']) if g['bitmap'] else b'') +
            field(3, 0, g['width']) + field(4, 0, g['height']) + field(5, 0, zigzag(g['left'])) +
            field(6, 0, zigzag(g['top'])) + field(7, 0, g['advance']))


def render(face_base, face_hi, ascender, cp):
    face_base.load_char(cp, freetype.FT_LOAD_NO_BITMAP | freetype.FT_LOAD_NO_HINTING)
    m = face_base.glyph.metrics
    left, top_b = m.horiBearingX >> 6, m.horiBearingY >> 6
    w, h = (m.width + 63) >> 6, (m.height + 63) >> 6
    advance = round(face_base.glyph.advance.x / 64)
    if w == 0 or h == 0:
        return {'id': cp, 'bitmap': b'', 'width': 0, 'height': 0, 'left': 0, 'top': -ascender, 'advance': advance}

    face_hi.load_char(cp, freetype.FT_LOAD_RENDER | freetype.FT_LOAD_NO_HINTING)
    bm = face_hi.glyph.bitmap
    hl, ht = face_hi.glyph.bitmap_left, face_hi.glyph.bitmap_top
    cov = np.array(bm.buffer, dtype=np.float32).reshape(bm.rows, bm.width) / 255.0 if bm.rows and bm.width else np.zeros((1, 1))
    pad = (BUFFER + RADIUS + 2) * SCALE
    big = np.zeros((cov.shape[0] + 2 * pad, cov.shape[1] + 2 * pad), dtype=bool)
    big[pad:pad + cov.shape[0], pad:pad + cov.shape[1]] = cov >= 0.5
    outside = distance_transform_edt(~big)
    inside = distance_transform_edt(big)
    sdf_hi = (outside - inside) / SCALE  # in base pixels, positive outside

    W, H = w + 2 * BUFFER, h + 2 * BUFFER
    xs = left - BUFFER + np.arange(W) + 0.5            # base-pixel x of each output column centre
    ys = top_b + BUFFER - np.arange(H) - 0.5            # base-pixel y (up) of each output row centre
    hx = np.clip(np.round(xs * SCALE - hl + pad).astype(int), 0, big.shape[1] - 1)
    hy = np.clip(np.round(ht - ys * SCALE + pad).astype(int), 0, big.shape[0] - 1)
    d = sdf_hi[np.ix_(hy, hx)]
    data = np.clip(np.round(255 - 255 * (d / RADIUS + CUTOFF)), 0, 255).astype(np.uint8)
    return {'id': cp, 'bitmap': data.tobytes(), 'width': w, 'height': h, 'left': left,
            'top': top_b - ascender, 'advance': advance}


def build(ttf, out_root):
    name = 'Overpass ' + ttf.stem.split('-', 1)[1]
    base = freetype.Face(str(ttf)); base.set_char_size(SIZE * 64)
    hi = freetype.Face(str(ttf)); hi.set_char_size(SIZE * SCALE * 64)
    ascender = base.size.ascender >> 6
    have = {cp for cp, _ in base.get_chars()}
    out = out_root / name
    out.mkdir(parents=True, exist_ok=True)
    count = 0
    for start in range(0, 65536, 256):
        rng = f'{start}-{start + 255}'
        glyphs = b''.join(field(3, 2, glyph_msg(render(base, hi, ascender, cp)))
                          for cp in range(start, start + 256) if cp in have)
        count += sum(1 for cp in range(start, start + 256) if cp in have)
        stack = field(1, 2, name.encode()) + field(2, 2, rng.encode()) + glyphs
        (out / f'{rng}.pbf').write_bytes(field(1, 2, stack))
    print(f'{name}: {count} glyphs')


if __name__ == '__main__':
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    for ttf in sorted(src.glob('Overpass-*.ttf')):
        build(ttf, dst)
