import { defineConfig } from 'vite';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { pipeline } from 'node:stream';
import { join, normalize, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// The project folder, whatever folder the server was started from.
const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA = join(ROOT, 'data');

// Serves data/*.pmtiles with HTTP range requests (PMTiles reads the file in pieces).
function serveData() {
  const handler = (req, res, next) => {
    const raw = (req.url ?? '').split('?')[0];
    if (!raw.startsWith('/data/')) return next();
    let url;
    try { url = decodeURIComponent(raw); } catch { res.statusCode = 400; return res.end(); }
    const file = normalize(join(ROOT, url));
    // Only files inside data/ (no folders, nothing outside it).
    if (!file.startsWith(DATA + sep) || !existsSync(file) || !statSync(file).isFile()) { res.statusCode = 404; return res.end(); }
    // pipeline closes the file when the browser cancels a request (PMTiles cancels many while panning).
    const send = (stream) => pipeline(stream, res, () => {});
    const size = statSync(file).size;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'application/octet-stream');
    const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
    if (!m) { res.setHeader('Content-Length', size); return send(createReadStream(file)); }
    const start = Number(m[1]);
    const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) { res.statusCode = 416; res.setHeader('Content-Range', `bytes */${size}`); return res.end(); }
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    res.setHeader('Content-Length', end - start + 1);
    send(createReadStream(file, { start, end }));
  };
  return {
    name: 'aitt-serve-data',
    configureServer: (s) => { s.middlewares.use(handler); },
    configurePreviewServer: (s) => { s.middlewares.use(handler); },
  };
}

export default defineConfig({
  plugins: [serveData()],
  build: { rollupOptions: { input: { demo: 'demo/index.html' } } },
  test: { include: ['tests/unit/**/*.test.js'] },
});
