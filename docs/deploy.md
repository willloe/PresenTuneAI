# Deploy Guide

This doc shows how to deploy **backend (FastAPI)** to **Render** and **frontend (Vite+React)** to **Vercel**, plus local Docker tips and **Week‑2 smoke tests**. Week 2 adds: per‑slide regenerate, image enrichment, and export + download route.

---

## Environments & Base URLs

- **Local (Docker/dev)** — API: `http://localhost:8000/v1` • UI: `http://localhost:5173`
- **Staging** — API: `https://<your-render>.onrender.com/v1` • UI: `https://<your-vercel>.vercel.app`

The frontend reads the API base from **`VITE_API_BASE` at build time**.

---

## Backend on Render (Web Service)

**Service type:** Web Service  
**Root directory:** `backend/` (monorepo)  
**Runtime:** Python **3.11**  
**Build command:** `pip install -r requirements.txt`  
**Start command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`  
**Health check path:** `/v1/health`

### Environment variables
Set these in **Render → Environment** (adjust to your needs):

```env
ENV=staging
DEBUG=false
API_BASE=/v1

# CORS
# Use ALLOW_ALL_CORS=true for initial staging; restrict later with CORS_ALLOW_ORIGINS JSON array string
ALLOW_ALL_CORS=true
# CORS_ALLOW_ORIGINS=["https://<your-vercel>.vercel.app"]

# Storage & uploads
STORAGE_DIR=data/uploads
MAX_UPLOAD_MB=25
ENABLE_RETENTION=true
RETENTION_DAYS=7
RETENTION_SWEEP_MINUTES=30

# Outline strategy (Week 2)
FEATURE_USE_MODEL=false
AGENT_URL=http://agent:8001
AGENT_TIMEOUT_MS=10000

# Image enrichment (Week 2)
FEATURE_IMAGE_API=true
IMAGE_PROVIDER=stub           # stub | pexels
# PEXELS_API_KEY=YOUR_PEXELS_KEY

# Observability (so browsers can read Server‑Timing across origins)
TIMING_ALLOW_ORIGIN=*
```

> Tip: If your repo previously included packages that build native modules (e.g., `watchfiles`, `maturin`), keep dependencies pure‑Python for Render.

### First deploy steps
1. Create **Web Service** → connect GitHub repo → set **Root directory** to `backend/`.
2. Set **Python version** to 3.11 (or add `runtime.txt` with `python-3.11.9`).
3. Set env vars above.
4. Deploy → wait until **Healthy**.

### Smoke tests (Week 2)
```bash
API=https://<your-render>.onrender.com/v1

# 1) Health
curl -i $API/health

# 2) Outline stub
curl -s $API/outline -H "Content-Type: application/json" -d '{"topic":"Demo","slide_count":3}' | jq '.version,.slide_count'

# 3) Regenerate slide (index=1)
curl -s $API/outline/1/regenerate -H "Content-Type: application/json" -d '{"topic":"Demo","slide_count":3}' | jq '.title'

# 4) Export + Download
# Prepare a minimal payload with slides (from previous outline)
# export.json will contain "path": "/abs/path/deck_YYYYMMDD_HHMMSS_default.txt"
curl -s $API/export -H "Content-Type: application/json" -d @payload.json | tee export.json
NAME=$(jq -r .path export.json | awk -F'[\/]' '{print $NF}')
curl -I $API/export/$NAME
```

Expect `version: "1.0"`, `x-request-id` and `Server-Timing` headers.

### Redeploy with a clean cache
Render → Service → **Settings** → **Clear build cache** → **Deploy latest commit**.

---

## Frontend on Vercel (Vite + React)

**Framework preset:** Vite  
**Build command:** `npm run build` (auto-detected)  
**Output directory:** `dist`

### Environment variables (Vercel)
Set per‑environment in **Project Settings → Environment Variables**:

- **Preview / Production**
  ```env
  VITE_API_BASE=https://<your-render>.onrender.com/v1
  ```

> When you build on Vercel, the value is **embedded** in the static bundle. Changing it requires a rebuild.

### Smoke tests
1. Open `https://<your-vercel>.vercel.app` → header should show **API: ok** and schema version chip.
2. Upload a PDF/DOCX/TXT → preview text appears.
3. Click **Generate** → slides render; try **Regenerate** on slide #2.
4. Click **Export** → a path is shown, and **Download** link returns the file.
5. In DevTools, verify response headers include `x-request-id` and `Server-Timing` (requires backend `TIMING_ALLOW_ORIGIN=*`).

### CORS reminder
If the UI can’t reach the API, add your Vercel origin to backend CORS:
- Temporarily `ALLOW_ALL_CORS=true`, **or**
- `CORS_ALLOW_ORIGINS=["https://<your-vercel>.vercel.app"]`.

---

## Local Docker (compose)

Common commands from repo root:
```bash
# Rebuild both services
docker compose up -d --build

# Rebuild UI only
docker compose up -d --build frontend

# Tail logs
docker compose logs -f backend
docker compose logs -f frontend
```

### Local API base for Dockerized UI
The Docker production build uses `.env.production`. For local, override with:
```
frontend/.env.production.local
VITE_API_BASE=http://localhost:8000/v1
```
Then rebuild:
```bash
docker compose build --no-cache frontend
docker compose up -d frontend
```

Check what’s baked into the bundle:
```bash
docker compose exec frontend sh -lc "grep -R 'onrender\|localhost:8000' -n /usr/share/nginx/html || true"
```

---

## Troubleshooting

**UI says “API: checking…”**  
- Verify API directly: `curl -i http://localhost:8000/v1/health`
- In browser DevTools → Network → confirm **Request URL** points to the intended API base.
- If `(blocked by CORS)`, set `ALLOW_ALL_CORS=true` or add your origin in `CORS_ALLOW_ORIGINS`.

**Server‑Timing not visible in the browser**  
- Ensure `TIMING_ALLOW_ORIGIN=*` (or your UI origin) is set in backend env.

**Render build fails**  
- Remove/avoid native build deps; pin Python 3.11.

**404 on /health**  
- Remember the prefix: `/v1/health`.

**502 on Render**  
- Wait for cold start; review Render Logs. Confirm **Start command** and **Health path**.

**Correlate errors**  
- Copy the `x-request-id` from UI (we surface it) and search logs for the same id.

---

## Post‑deploy checklist

- [ ] Backend: `/v1/health` returns 200 with `x-request-id` + `Server-Timing`.
- [ ] Backend: `/v1/outline` returns a Deck with `version: "1.0"`.
- [ ] Backend: `/v1/export/{filename}` serves a file after export.
- [ ] Frontend: shows **API: ok**, upload → outline → regenerate → export → download work.
- [ ] CORS and `TIMING_ALLOW_ORIGIN` configured for your UI origin.
- [ ] Env parity documented in repo (`docs/deploy.md`).

---

## Rollback

- **Render:** Deploy previous commit from the “Events” tab (or Git revert).
- **Vercel:** Redeploy a previous build from Deployments → “Redeploy”.

---

## URLs (fill in for your project)

- **Render (API):** `https://presentuneai.onrender.com/v1`
- **Vercel (UI):** `https://presentuneai.vercel.app`
