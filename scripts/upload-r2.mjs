// Upload the map files to the Cloudflare R2 bucket (free tier), then write hosting.json for the deploy.
//   node scripts/upload-r2.mjs            upload what is missing or changed
//   node scripts/upload-r2.mjs --dry-run  list what would go up
// Needs (see docs/HOSTING.md; set them in your own terminal, never commit them):
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY   an R2 API token with Object Read & Write on the bucket
//   R2_PUBLIC_URL   the bucket's public address, e.g. https://tiles.aitransportationtools.com
// The basemap is 1.5 GB, past wrangler's ~300 MB single-upload limit, so this uses R2's S3 interface with
// multipart upload. A file already in the bucket with the same size is skipped, so a failed run can be rerun.
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync, createReadStream } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

export const BUCKET = 'aitt-map';

/** Every file that goes up, with its key in the bucket. Pure, so it can be tested. */
export function planUpload({ build, fonts }) {
  return [
    { local: 'data/california.pmtiles', key: `basemap/v${build}.pmtiles`, contentType: 'application/octet-stream' },
    { local: 'data/union-city-naip.pmtiles', key: 'imagery/union-city-naip-2022.pmtiles', contentType: 'application/octet-stream' },
    ...fonts.map((f) => ({ local: `public/fonts/${f}`, key: `fonts/${f}`, contentType: 'application/x-protobuf' })),
  ];
}

/** The addresses apps use once the files are up. The basemap address names an exact build. */
export function publicUrls(base, build) {
  const b = base.replace(/\/$/, '');
  return {
    basemapUrl: `${b}/basemap/v${build}.pmtiles`,
    photosUrl: `${b}/imagery/union-city-naip-2022.pmtiles`,
    glyphs: `${b}/fonts/{fontstack}/{range}.pbf`,
  };
}

function listFonts(root = 'public/fonts') {
  const out = [];
  for (const dir of readdirSync(root)) for (const f of readdirSync(join(root, dir))) out.push(relative(root, join(root, dir, f)).replaceAll('\\', '/'));
  return out;
}

async function main() {
  const dry = process.argv.includes('--dry-run');
  const { build } = JSON.parse(readFileSync('data/basemap.json', 'utf8'));
  const plan = planUpload({ build, fonts: listFonts() }).filter((p) => existsSync(p.local));
  const bytes = plan.reduce((n, p) => n + statSync(p.local).size, 0);
  console.log(`${plan.length} files, ${(bytes / 1e9).toFixed(2)} GB, to r2://${BUCKET}`);
  if (dry) { for (const p of plan) console.log(`  ${p.local} -> ${p.key}`); return; }

  const need = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_URL'].filter((k) => !process.env[k]);
  if (need.length) throw new Error(`Set ${need.join(', ')} first (docs/HOSTING.md, step 3)`);
  const { S3Client, HeadObjectCommand } = await import('@aws-sdk/client-s3');
  const { Upload } = await import('@aws-sdk/lib-storage');
  const s3 = new S3Client({ region: 'auto', endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });

  let done = 0;
  for (const p of plan) {
    const size = statSync(p.local).size;
    const have = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: p.key })).then((h) => h.ContentLength, () => -1);
    if (have === size) { done++; continue; }
    const up = new Upload({ client: s3, queueSize: 4, partSize: 64 * 1024 * 1024,
      params: { Bucket: BUCKET, Key: p.key, Body: createReadStream(p.local), ContentType: p.contentType,
        CacheControl: p.key.startsWith('basemap/') ? 'public, max-age=31536000, immutable' : 'public, max-age=86400' } });
    if (size > 100e6) up.on('httpUploadProgress', (e) => process.stdout.write(`\r  ${p.key} ${Math.round((100 * e.loaded) / size)}%`));
    await up.done();
    if (size > 100e6) process.stdout.write('\n');
    done++;
  }
  const urls = publicUrls(process.env.R2_PUBLIC_URL, build);
  writeFileSync('hosting.json', JSON.stringify({ ...urls, build, uploaded: new Date().toISOString() }, null, 2) + '\n');
  console.log(`${done}/${plan.length} files in the bucket; wrote hosting.json:`, urls);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
