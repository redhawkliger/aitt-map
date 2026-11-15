import { defineConfig } from 'vite';
import { createReadStream, statSync, existsSync } from 'node:fs';
import { join, normalize } from 'node:path';

// Serves data/*.pmtiles with HTTP range requests (PMTiles reads the file in pieces).
function serveData() {
  const handler = (req, res, next) => {
    const url = decodeURIComponent((req.url ?? '').split('?')[0]);
    if (!url.startsWith('/data/')) return next();
    const file = normalize(join(process.cwd(), url));
    if (!file.startsWith(join(process.cwd(), 'data')) || !existsSync(file)) { res.statusCode = 404; return res.end(); }
    const size = statSync(file).size;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'application/octet-stream');
    const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
    if (!m) { res.setHeader('Content-Length', size); return createReadStream(file).pipe(res); }
    const start = Number(m[1]);
    const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) { res.statusCode = 416; res.setHeader('Content-Range', `bytes */${size}`); return res.end(); }
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    res.setHeader('Content-Length', end - start + 1);
    createReadStream(file, { start, end }).pipe(res);
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
