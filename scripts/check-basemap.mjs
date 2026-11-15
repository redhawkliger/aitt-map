// Layer 1 check: read a .pmtiles file's header and metadata.
// Usage: node scripts/check-basemap.mjs [data/california.pmtiles]
import { open } from 'node:fs/promises';
import { PMTiles } from 'pmtiles';
import { pathToFileURL } from 'node:url';

/** A pmtiles Source that reads byte ranges from a local file. */
class FileSource {
  constructor(path) { this.path = path; this.fh = null; }
  getKey() { return this.path; }
  async getBytes(offset, length) {
    this.fh ??= await open(this.path, 'r');
    const buf = Buffer.alloc(length);
    const { bytesRead } = await this.fh.read(buf, 0, length, offset);
    const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + bytesRead);
    return { data };
  }
  async close() { await this.fh?.close(); this.fh = null; }
}

/**
 * @param {string} path
 * @returns {Promise<{minZoom:number, maxZoom:number, bounds:[number,number,number,number], layers:string[]}>}
 */
export async function checkBasemap(path) {
  const source = new FileSource(path);
  try {
    const p = new PMTiles(source);
    const h = await p.getHeader();
    const meta = await p.getMetadata();
    return {
      minZoom: h.minZoom,
      maxZoom: h.maxZoom,
      bounds: [h.minLon, h.minLat, h.maxLon, h.maxLat],
      layers: (meta?.vector_layers ?? []).map((l) => l.id),
    };
  } finally {
    await source.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  console.log(JSON.stringify(await checkBasemap(process.argv[2] ?? 'data/california.pmtiles'), null, 2));
}
