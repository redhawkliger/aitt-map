// Layer 1: cut California out of the newest complete Protomaps daily build.
// Usage: npm run basemap   (writes data/california.pmtiles and data/basemap.json)
// Needs only Node. Downloads the pinned go-pmtiles tool into bin/ on first run (Windows, macOS or Linux).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const PMTILES_VERSION = '1.31.2';
export const BBOX = [-124.5, 32.4, -114.0, 42.1]; // California, with a small margin
export const MAX_ZOOM = 15;
const BUILDS = 'https://build-metadata.protomaps.dev/builds.json';

function toolName() {
  const os = { win32: 'Windows', darwin: 'Darwin', linux: 'Linux' }[process.platform];
  const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  const ext = process.platform === 'linux' ? 'tar.gz' : 'zip';
  return `go-pmtiles_${PMTILES_VERSION}_${os}_${arch}.${ext}`;
}

function ensureTool() {
  const exe = join('bin', process.platform === 'win32' ? 'pmtiles.exe' : 'pmtiles');
  if (existsSync(exe)) return exe;
  mkdirSync('bin', { recursive: true });
  const archive = join('bin', toolName());
  const url = `https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/${toolName()}`;
  execFileSync('curl', ['-sSL', '-o', archive, url], { stdio: 'inherit' });
  execFileSync('tar', ['-xf', archive, '-C', 'bin'], { stdio: 'inherit' }); // tar reads .zip on Windows 10+
  return exe;
}

/** The newest build that is at least a day old (today's may still be uploading). */
export async function latestBuild(fetchImpl = fetch, now = new Date()) {
  const builds = await (await fetchImpl(BUILDS)).json();
  const cutoff = new Date(now.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10).replaceAll('-', '');
  const keys = builds.map((b) => b.key.replace('.pmtiles', '')).filter((k) => /^\d{8}$/.test(k) && k <= cutoff);
  if (!keys.length) throw new Error('No Protomaps build found');
  return keys.sort().at(-1);
}

async function main() {
  const exe = ensureTool();
  const build = await latestBuild();
  mkdirSync('data', { recursive: true });
  const out = join('data', 'california.pmtiles');
  execFileSync(exe, ['extract', `https://build.protomaps.com/${build}.pmtiles`, out,
    `--bbox=${BBOX.join(',')}`, `--maxzoom=${MAX_ZOOM}`, '--download-threads=8'], { stdio: 'inherit' });
  writeFileSync(join('data', 'basemap.json'), JSON.stringify({
    build, bbox: BBOX, maxzoom: MAX_ZOOM, tool: `pmtiles ${PMTILES_VERSION}`,
    created: new Date().toISOString().slice(0, 10) }, null, 2) + '\n');
  console.log(`build ${build}: ${(statSync(out).size / 1e9).toFixed(2)} GB → ${out}`);
}

if (process.argv[1]?.endsWith('get-basemap.mjs')) await main();
