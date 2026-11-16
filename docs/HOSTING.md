# Putting the map online ($0)

**Live:** https://map.aitransportationtools.com/demo/ (also at https://aitt-map.akshaeysabha.workers.dev/demo/)

Two free Cloudflare services:

- **Map files**: **R2** storage, bucket `aitt-map`, served at `tiles.aitransportationtools.com`.
  - The basemap (1.5 GB).
  - The crisp 2024 aerial photos, one file per Bay Area county (3.3 GB), under `imagery/naip-2024/`.
  - The label fonts.
- **Demo page**: a **Worker** with static assets, named `aitt-map`, at `map.aitransportationtools.com`. The settings are in `wrangler.jsonc`.

The map files and the demo page need different addresses, because one hostname can't point at both an R2 bucket and a Worker.

**What it costs:** $0 at our size.
- **R2 free tier:**
  - 10 GB of storage; we use about 4.8 GB.
  - 10 million reads a month.
  - Downloads (egress) are always free.
- **Workers static assets:** free.

Cloudflare asks for a card to switch R2 on, even on the free tier.

Steps marked **you** need your Cloudflare account. Claude doesn't do those.

**Windows note:** if PowerShell refuses `npm` or `npx` ("running scripts is disabled"), type `npm.cmd` / `npx.cmd`. Don't change the execution policy. If downloads fail with certificate errors, which happens when antivirus scans HTTPS, run `$env:NODE_OPTIONS = '--use-system-ca'` first.

## 1. Domain

`aitransportationtools.com` already uses Cloudflare DNS (account ID `4ccc84059e91bfa393e9d345c63b1153`), so the custom addresses `tiles.` and `map.` work.

## 2. The bucket (done)

The bucket was set up with the `cf` CLI. To redo it in the dashboard instead: **R2 Object Storage** → `aitt-map` → **Settings**.

- **Location:** Western North America (WNAM).
- **Storage class:** Standard.
- **Public access:** custom domain `tiles.aitransportationtools.com`, minimum TLS 1.2.
- **CORS policy:**

```json
[
  {
    "AllowedOrigins": [
      "https://map.aitransportationtools.com",
      "https://aitransportationtools.com",
      "https://www.aitransportationtools.com",
      "https://aitt-map.akshaeysabha.workers.dev",
      "https://aitt-map.pages.dev",
      "http://localhost:5199",
      "http://localhost:5198"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range", "If-Match"],
    "ExposeHeaders": ["ETag", "Content-Range", "Content-Length"],
    "MaxAgeSeconds": 86400
  }
]
```

The map reads its files in small pieces (HTTP range requests), so `Range` has to be allowed and `ETag` exposed.

## 3. You: upload the map files

1. **R2** → **Manage API tokens** → **Create Account API token**:
   - **Permissions:** Object Read & Write
   - **Specify bucket:** `aitt-map` only
2. In a PowerShell window in this repo, run:

```powershell
$env:NODE_OPTIONS = '--use-system-ca'
$env:R2_ACCOUNT_ID = '4ccc84059e91bfa393e9d345c63b1153'
$env:R2_PUBLIC_URL = 'https://tiles.aitransportationtools.com'
npm.cmd run upload
```

3. The upload asks for the **Access Key ID** and then the **Secret Access Key**. Paste each one and press Enter.
   - Nothing shows while you paste. That's on purpose: the keys never end up on screen, in your command history or in a file.

The first upload took about an hour (1034 files, 4.8 GB). You can run it again at any time: files already in the bucket with the same size are skipped.

When it finishes, it prints `wrote hosting.json`. That file holds only public addresses, no keys, and is committed. To upload more county photos, run `projects/naip-store` to build them into `data/naip/`, then run the upload again.

**Rollback:** each basemap goes up under its build date (`basemap/v20261114.pmtiles`). To go back, point `basemapUrl` in `hosting.json` at an older one and redeploy.

## 4. You: deploy the demo

```powershell
npx.cmd wrangler login     # once: opens the browser to sign in to Cloudflare
npm.cmd run deploy
```

`npm run deploy` does two things:
- builds the page with the addresses in `hosting.json`
- runs `wrangler deploy`, which publishes it at `map.aitransportationtools.com` (the `routes` entry in `wrangler.jsonc`) and at the workers.dev address

## 5. Check it

```powershell
$env:BASE_URL = "https://map.aitransportationtools.com"; npx.cmd playwright test tests/e2e/gate.spec.js
```

These are the same checks that run locally: names at every zoom at the three test places, the credit line, and the jump-to list.

## Safety settings (before you share the link)

- **Security headers** ship with the site in `public/_headers`:
  - The page loads only our own files, our R2 bucket and the USGS satellite imagery.
  - No plugins, and other sites can't put it in a frame.
  - No camera, microphone or location access.

  If you move the map files to a different address, add it to `connect-src` there, or the map won't load.
- **Cloudflare's bot check:** on `map.aitransportationtools.com`, Cloudflare adds a small bot-check script to the page. The security headers block it, which only shows as a console message; the map is unaffected.
- **You: budget alert.** Cloudflare dashboard → **Manage Account** → **Billing** → **Billable Usage** → set a usage notification (e.g. $5).
  - R2 is free up to 10 GB stored and 10 million reads a month.
  - The alert tells you if a scraper or a viral link pushes past that, before it costs anything real.
- **You: upload key scope.** The R2 API token from step 3 should be "Object Read & Write" on the `aitt-map` bucket only. Never paste it into chat or into a file in the repo.
