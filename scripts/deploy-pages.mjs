// Build the demo against the hosted map files (hosting.json, from upload-r2.mjs) and deploy it to Cloudflare Pages.
//   npx wrangler login        (once; opens a browser to sign in to your Cloudflare account)
//   node scripts/deploy-pages.mjs
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const h = JSON.parse(readFileSync('hosting.json', 'utf8'));
// The satellite layer takes a comma-separated list of crisp photo files (one per area).
const env = { ...process.env, VITE_BASEMAP_URL: h.basemapUrl,
  VITE_PHOTOS_URLS: (h.photosUrls ?? [h.photosUrl]).join(',') };
execSync('npx vite build', { stdio: 'inherit', env });
execSync('npx wrangler pages deploy dist --project-name aitt-map --branch main --commit-dirty=true', { stdio: 'inherit', env });
console.log('Deployed. Demo: https://aitt-map.pages.dev/demo/ (and https://map.aitransportationtools.com/demo/ once the domain is attached)');
