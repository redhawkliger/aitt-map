// Build data/traffic.pmtiles (signals, signs, crosswalks, lanes, speed, bike lanes, bus stops) for California.
//   node scripts/get-traffic.mjs [path/to/california-latest.osm.pbf]
// Needs Java 21+ (set JAVA to its java executable, or have java on PATH). Downloads the pinned Planetiler jar into
// bin/ and, when no extract is given, the Geofabrik California extract into data/ (about 1.3 GB). Takes a few minutes.
import { existsSync, mkdirSync, createWriteStream, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const PLANETILER_VERSION = '0.10.2';
const JAR = `bin/planetiler-${PLANETILER_VERSION}.jar`;
const OSM_URL = 'https://download.geofabrik.de/north-america/us/california-latest.osm.pbf';
const JAVA = process.env.JAVA ?? 'java';

async function download(url, out) {
  console.log(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(out));
}

mkdirSync('bin', { recursive: true });
if (!existsSync(JAR)) {
  await download(`https://github.com/onthegomap/planetiler/releases/download/v${PLANETILER_VERSION}/planetiler.jar`, JAR);
}
const osm = process.argv[2] ?? 'data/california-latest.osm.pbf';
if (!existsSync(osm)) await download(OSM_URL, osm);

const r = spawnSync(JAVA, ['-Xmx6g', '-jar', JAR, 'generate-custom', '--schema=schema/traffic.yml',
  `--osm_path=${osm}`, '--output=data/traffic.pmtiles', '--force'], { stdio: 'inherit' });
if (r.status !== 0) throw new Error(`Planetiler failed (exit ${r.status ?? r.error?.message})`);

const meta = { built: new Date().toISOString(), planetiler: PLANETILER_VERSION, osm, osmModified: statSync(osm).mtime,
  bytes: statSync('data/traffic.pmtiles').size };
writeFileSync('data/traffic.json', JSON.stringify(meta, null, 2));
console.log(meta);
