# Deploy Guide

This guide covers deploying the **backend (FastAPI)** and **frontend (Vite + React)**, plus local Docker tips and smoke tests. It reflects the latest features: outline generation & per‑slide regenerate, a **layout library** (JSON‑driven), layout recommendations, an **EditorDoc** builder with **Idempotency‑Key** support, export to **PPTX**, and lightweight observability.

---

## Environments & Base URLs

- **Local (Docker/dev)** — API: `http://localhost:8000/v1` • UI: `http://localhost:5173`
- **Staging/Prod** — API: `https://<your-api-host>/v1` • UI: `https://<your-ui-host>`

The frontend reads the API base from **`VITE_API_BASE` at build time**.

---

## Backend on Render (Web Service)

**Service type:** Web Service  
**Root directory:** `backend/` (monorepo)  
**Runtime:** Python **3.11**  
**Build command:** `pip install -r requirements.txt`  
**Start command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`  
**Health check path:** `/v1/health`

### Environment variables (suggested)
```env
ENV=staging
DEBUG=false
API_BASE=/v1

# CORS
ALLOW_ALL_CORS=true
# CORS_ALLOW_ORIGINS=["https://<your-ui>.vercel.app"]

# Storage & uploads
STORAGE_DIR=data/uploads
MAX_UPLOAD_MB=25
ENABLE_RETENTION=true
RETENTION_DAYS=7
RETENTION_SWEEP_MINUTES=30

# Outline strategy
FEATURE_USE_MODEL=false
AGENT_URL=http://agent:8001
AGENT_TIMEOUT_MS=10000

# Image enrichment
FEATURE_IMAGE_API=true
IMAGE_PROVIDER=stub           # stub | pexels
# PEXELS_API_KEY=YOUR_PEXELS_KEY

# Observability
TIMING_ALLOW_ORIGIN=*
```

> Tip: Keep dependencies pure‑Python for Render. Pin Python with a `runtime.txt` (e.g., `python-3.11.9`) if needed.

### Static assets & the layout library

If the folder `backend/app/static/` exists, it is mounted under `/static`. The **layout library** is auto‑loaded from:

```
backend/app/static/layouts/layouts.json
```

- If the file is **missing** or invalid, the API uses a **built‑in** 3‑item library.
- You can **hot‑reload** at runtime: `GET /v1/layouts?reload=true`.
- PNG previews referenced by `preview_url` are optional — the UI can render previews straight from the JSON.
- Example minimal `layouts.json`:

```json
{
  "items": [
    {
      "id": "title_bullets_left",
      "name": "Title + Bullets (Left)",
      "supports": { "text_min": 1, "text_max": 12, "images_min": 0, "images_max": 1 },
      "weight": 0.95,
      "frames": {
        "title":   { "x": 80, "y": 64,  "w": 1120, "h": 80 },
        "bullets": [{ "x": 80, "y": 170, "w": 720,  "h": 360 }],
        "images":  [{ "x": 840, "y": 200, "w": 360,  "h": 240 }]
      }
    }
  ],
  "page": 1,
  "page_size": 1,
  "total": 1
}
```

---

## Frontend on Vercel (Vite + React)

**Framework preset:** Vite  
**Build command:** `npm run build`  
**Output directory:** `dist`

### Environment variables (Vercel)
Set per‑environment in **Project Settings → Environment Variables**:

```env
VITE_API_BASE=https://<your-api-host>/v1
```

> Because the UI is static, changing the API base requires a rebuild.

### Smoke tests
1. Open the site → header shows **API: ok** and schema version.
2. Upload a PDF/DOCX/TXT → preview text appears.
3. Click **Generate** → slides render; try **Regenerate** on slide #2.
4. Step **Layout Selection** → recommended layouts appear (fetched from `/layouts/filter`), and you can view “Selected / Recommended / All” modes.
5. Click **Build Editor Doc** → persists an **EditorDoc** (built from your selections).
6. Click **Export** → returns an export `path`; the **Download** link should stream the file from `/v1/export/{filename}`.
7. In DevTools, ensure response headers include `x-request-id` and `Server-Timing`.

If the UI can’t reach the API, temporarily set `ALLOW_ALL_CORS=true` on the backend or add your Vercel origin to `CORS_ALLOW_ORIGINS`.

---

## API smoke tests (curl)

```bash
API=https://<your-api-host>/v1

# Health
curl -i $API/health

# Layouts (built-in or from JSON)
curl -s $API/layouts | jq '.total,.items[0].id'

# Layout filter/rank
curl -s $API/layouts/filter -H "Content-Type: application/json"   -d '{"components":{"text_count":4,"image_count":1},"top_k":3}' | jq .

# Outline (placeholder strategy if FEATURE_USE_MODEL=false)
curl -s $API/outline -H "Content-Type: application/json"   -d '{"topic":"Demo","slide_count":3}' | tee deck.json | jq '.slides|length'

# Regenerate slide #1
curl -s $API/outline/1/regenerate -H "Content-Type: application/json"   -d '{"topic":"Demo","slide_count":3}' | jq .title

# Build EditorDoc (idempotent)
IDEMP=$(uuidgen | tr -d '-')
jq '{deck:., selections: [.slides[]|{slide_id:.id,layout_id:null}], theme:"default"}' deck.json > build.json
curl -s $API/editor/build -H "Idempotency-Key: $IDEMP" -H "Content-Type: application/json"   -d @build.json | tee editor.json | jq '.editor.slides|length'

# Export (editor-aware if you pass editor, else simple slides export)
jq '{editor:.editor, theme:"default"}' editor.json > export_body.json
curl -s $API/export -H "Content-Type: application/json" -d @export_body.json | tee export.json
NAME=$(jq -r .path export.json | awk -F'[/]' '{print $NF}')
curl -I $API/export/$NAME
```

---

## Local Docker (compose)

Common commands from repo root:

```bash
# Rebuild services
docker compose up -d --build

# Rebuild only UI
docker compose up -d --build frontend

# Tail logs
docker compose logs -f backend
docker compose logs -f frontend
```

### Local API base for Dockerized UI

Create `frontend/.env.production.local` with:

```env
VITE_API_BASE=http://localhost:8000/v1
```

Then rebuild the `frontend` image:

```bash
docker compose build --no-cache frontend
docker compose up -d frontend
```

To verify which API the bundle uses:

```bash
docker compose exec frontend sh -lc "grep -R 'onrender\|localhost:8000' -n /usr/share/nginx/html || true"
```

---

## Troubleshooting

**UI stuck at “API: checking…”**  
- `curl -i http://localhost:8000/v1/health` directly.  
- In Network tab, confirm the **Request URL** matches `VITE_API_BASE` in your bundle.  
- Resolve CORS by setting `ALLOW_ALL_CORS=true` or configuring `CORS_ALLOW_ORIGINS` properly.

**No Server‑Timing in DevTools**  
- Ensure `TIMING_ALLOW_ORIGIN=*` (or your UI origin).

**Render 502 / cold starts**  
- Check Render logs; confirm **Start command** and **Health check**.  
- Clear build cache and redeploy if the build environment changed.

**Layouts appear stuck**  
- If you changed `layouts.json`, call `/v1/layouts?reload=true`.  
- If the static folder is missing, the API uses the built‑in defaults.

---

## Rollback

- **Render:** Deploy a previous commit from the “Events” tab (or Git revert).  
- **Vercel:** Redeploy a previous build from Deployments → “Redeploy”.

---

## Fill‑me‑ins

- **API URL:** `https://<your-api-host>/v1`  
- **UI URL:** `https://<your-ui-host>`

## Extra Inforamtion

### Static assets
Ensure these exist in the image or are bind-mounted:
```
backend/app/static/layouts/layouts.json
backend/app/static/layouts/*.png     # optional thumbnails
```
Hot reload in dev: `GET /v1/layouts?reload=true`.

### Docker volumes (dev)
```yaml
services:
  backend:
    volumes:
      - ./backend/data/uploads:/app/data/uploads
      - ./backend/app/static:/app/app/static
```

### Healthcheck
Explain what it calls (`/v1/health`) and typical failure causes (import errors, static dir missing).

---