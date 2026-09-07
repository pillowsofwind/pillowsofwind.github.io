# Nature trip uploader (Cloudflare Worker + R2)

Upload trips from a simple web form. Photos and `trips.json` go to R2 — **no Git commit** for new trips.

## One-time setup

### 1. Confirm R2 bucket
In Cloudflare → R2, note your bucket name (default in config: `trip-photos`).
Public base URL you already use:
`https://pub-ef165a3e20f24d10a0bafbb1aa236e40.r2.dev`

If the bucket name differs, edit `wrangler.toml`:
```toml
bucket_name = "YOUR_BUCKET_NAME"
```

### 2. Seed existing trips to R2
Upload the repo file once so the site has all current trips:

```bash
cd trip-worker
npx wrangler r2 object put trip-photos/trips.json --file=../data/trips.json --content-type=application/json
```

(Change `trip-photos` if your bucket name differs.)

### 3. Deploy Worker
```bash
cd trip-worker
npm i -g wrangler   # if needed
npx wrangler login
npx wrangler secret put ADMIN_PASSWORD   # choose a strong password
npx wrangler deploy
```

Copy the Worker URL, e.g. `https://nature-trip-uploader.<account>.workers.dev`

### 4. Point the site at the Worker
Edit `javascripts/nature-config.js`:
```js
workerUrl: "https://nature-trip-uploader.<account>.workers.dev",
```

Or open `admin.html` → **Advanced: Worker URL** and paste it (saved in your browser).

### 5. Commit & push site code once
Push `admin.html`, `nature.html`, `javascripts/*`, `data/trips.json`, `trip-worker/*` to GitHub Pages.
After that, **new trips do not need commits**.

## Daily use
1. Open `https://yoursite/admin.html`
2. **Add trip** — fill form, drop photos, upload
3. **Edit / delete** — Load trips → click a trip to edit, or Delete
4. Nature page updates from R2 `trips.json` (no Git commit)

### Editing
- Change title, date, tags, trip report text
- Remove existing photos with ×
- Add more photos via drop zone
- **Save changes**
- **Delete** removes the trip and its R2 photos

## Notes
- Keep `admin.html` off public nav (password + obscure URL).
- Each trip requires `date` + `endDate` (`YYYY-MM-DD`); same day for day trips.
- Trips sort newest-first by start date; the page shows a range only when end ≠ start.
- Year/month headings are derived from the start date.
- `admin.html` auto-converts HEIC/HEIF → JPEG in the browser before upload (via `heic2any`).
- Existing HEIC already on R2 is unchanged until you replace those photos.
- `trips.json` on R2 is the live source; `./data/trips.json` is a fallback seed.
- After updating Worker code, redeploy: `npx wrangler deploy`
