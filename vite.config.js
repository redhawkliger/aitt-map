import { defineConfig } from 'vite';
import { createReadStream, statSync, existsSync, readFileSync, readdirSync } from 'node:fs';
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

// The local preview of the built site sends the same headers as Cloudflare Pages (public/_headers, "/*" rules only),
// so the browser tests check the map really loads under the production security policy.
function previewHeaders() {
  const rules = [];
  let inAll = false;
  for (const line of readFileSync(join(ROOT, 'public', '_headers'), 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) { inAll = line.trim() === '/*'; continue; }
    const i = line.indexOf(':');
    if (inAll && i > 0) rules.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  }
  return {
    name: 'aitt-preview-headers',
    configurePreviewServer: (s) => { s.middlewares.use((req, res, next) => { for (const [k, v] of rules) res.setHeader(k, v); next(); }); },
  };
}

// The crisp aerial photos: one file per county in data/naip/. A hosted build passes VITE_PHOTOS_URLS instead.
const localPhotos = existsSync(join(DATA, 'naip'))
  ? readdirSync(join(DATA, 'naip')).filter((f) => f.endsWith('.pmtiles')).sort().map((f) => `/data/naip/${f}`) : [];

export default defineConfig({
  plugins: [serveData(), previewHeaders()],
  define: process.env.VITE_PHOTOS_URLS ? {} : { 'import.meta.env.VITE_PHOTOS_URLS': JSON.stringify(localPhotos.join(',') || '/data/union-city-naip.pmtiles') },
  build: { rollupOptions: { input: { demo: 'demo/index.html', sim: 'demo/sim.html' } } },
  test: { include: ['tests/unit/**/*.test.js'] },
});
