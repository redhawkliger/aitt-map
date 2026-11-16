# Putting the map online ($0)

Two free Cloudflare services:

- **Map files**: **R2** storage, bucket `aitt-map`, served at `tiles.aitransportationtools.com`. Holds the basemap (1.5 GB), the Union City photos and the label fonts.
- **Demo page**: **Pages**, at `map.aitransportationtools.com/demo/`. Until the domain is attached it is at `aitt-map.pages.dev/demo/`.

The map files and the demo page need different addresses, because one hostname can't point at both an R2 bucket and a Pages site.

**What it costs:** $0 at our size.
- **R2 free tier:**
  - 10 GB of storage; we use about 1.6 GB.
  - 10 million reads a month.
  - Downloads (egress) are always free.
- **Pages:** free.

Cloudflare asks for a card to switch R2 on, even on the free tier.

Steps marked **you** need your Cloudflare account. Claude doesn't do those.

## 1. You: check where the domain's DNS lives

Custom addresses like `tiles.` and `map.` need `aitransportationtools.com` to use Cloudflare DNS.

- **Already on Cloudflare** (the domain shows under Websites in the Cloudflare dashboard): go on to step 2.
- **Not on Cloudflare:** moving DNS affects the live site, so plan it separately. Until then, use the free addresses: the bucket's `r2.dev` URL and `aitt-map.pages.dev`. Everything below still works with those.

## 2. You: create the bucket

1. Cloudflare dashboard → **R2 Object Storage** → **Create bucket**:
   - **Name:** `aitt-map`
   - **Location:** Automatic
   - **Storage class:** Standard
2. Open the bucket → **Settings** → **Public access**:
   - **Custom Domains** → **Connect Domain** → `tiles.aitransportationtools.com`.
   - Or, without the domain: **R2.dev subdomain** → **Allow**. This gives a `https://pub-….r2.dev` address. Cloudflare rate-limits it, so use it for testing only.
3. **Settings** → **CORS policy** → **Edit**, and paste:

```json
[
  {
    "AllowedOrigins": [
      "https://map.aitransportationtools.com",
      "https://aitransportationtools.com",
      "https://www.aitransportationtools.com",
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

The map reads the basemap in small pieces (HTTP range requests), so `Range` has to be allowed and `ETag` exposed.

## 3. You: make an upload key and upload

1. **R2** → **Manage R2 API Tokens** → **Create API token**:
   - **Permissions:** Object Read & Write
   - **Specify bucket:** `aitt-map`
2. Copy three values: the **Access Key ID**, the **Secret Access Key**, and your **Account ID** (shown on the R2 page).
3. In a PowerShell window in this repo, set the values and upload. They stay in that window only. Never put them in a file.

```powershell
$env:R2_ACCOUNT_ID = "<account id>"
$env:R2_ACCESS_KEY_ID = "<access key id>"
$env:R2_SECRET_ACCESS_KEY = "<secret access key>"
$env:R2_PUBLIC_URL = "https://tiles.aitransportationtools.com"   # or the pub-….r2.dev address
npm run upload
```

The upload takes a while (1.5 GB), and you can safely run it again:
- files already up are skipped
- a basemap upload cut off midway restarts from the beginning

When it finishes, it writes `hosting.json` with the public addresses. Commit that file: it holds only addresses, no keys.

**Rollback:** each basemap goes up under its build date (`basemap/v20261114.pmtiles`). To go back, point `basemapUrl` in `hosting.json` at an older one and redeploy.

## 4. You: deploy the demo

```powershell
npx wrangler login     # once: opens the browser to sign in to Cloudflare
npm run deploy
```

The first deploy creates the Pages project `aitt-map`. Then attach the address: **Workers & Pages** → **aitt-map** → **Custom domains** → `map.aitransportationtools.com`.

## 5. Check it

```powershell
$env:BASE_URL = "https://aitt-map.pages.dev"; npx playwright test tests/e2e/gate.spec.js
```

These are the same checks that run locally: names at every zoom at the three test places, the credit line, and the jump-to list.
