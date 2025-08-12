# Deploy Guide (Week 1)

This doc shows how to deploy **backend (FastAPI)** to **Render** and **frontend (Vite+React)** to **Vercel**, plus local Docker tips and smoke tests.

---

## Environments & Base URLs

- **Local (Docker/dev)** — API: `http://localhost:8000/v1` • UI: `http://localhost:5173`
- **Staging** — API: `https://<your-render>.onrender.com/v1` • UI: `https://<your-vercel>.vercel.app`

The frontend reads the API base from `VITE_API_BASE` at **build time**.

---

## Backend on Render (Web Service)

**Service type:** Web Service  
**Root directory:** `backend/` (monorepo)  
**Runtime:** Python **3.11**  
**Build command:** `pip install -r requirements.txt`  
**Start command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`  
**Health check path:** `/v1/health`

### Environment variables
Set these in **Render → Environment**:
```
ENV=staging
DEBUG=false
API_BASE=/v1
ALLOW_ALL_CORS=true      # turn on for first deploy; restrict later
ENABLE_RETENTION=true
RETENTION_DAYS=7
RETENTION_SWEEP_MINUTES=30
```

> Tip: If your repo once included `watchfiles` or built Rust wheels, remove those for Render (keep pure-Python deps).

### First deploy steps
1. Create Web Service → connect GitHub repo → set **Root** to `backend/`.
2. Set **Python version** to 3.11 (or via `runtime.txt` with `python-3.11.9`).
3. Add env vars above.
4. Deploy → wait until **Healthy**.

### Smoke tests
```bash
# Health
curl -i https://<render>.onrender.com/v1/health

# Outline stub
curl -s https://<render>.onrender.com/v1/outline   -H "Content-Type: application/json"   -d '{"topic":"Demo","slide_count":3}' | jq '.version,.slide_count'
```
Expect `version: "1.0"` and `x-request-id` in response headers.

### Redeploy with a clean cache
Render → Service → **Settings** → **Clear build cache** → **Deploy latest commit**.

---

## Frontend on Vercel (Vite + React)

**Framework preset:** Vite  
**Build command:** `npm run build` (Vercel auto-detects)  
**Output directory:** `dist`

### Environment variables (Vercel)
Set per-environment in Project Settings → Environment Variables:

- **Preview / Production**
  ```
  VITE_API_BASE=https://<your-render>.onrender.com/v1
  ```

> When you build on Vercel, the value is embedded in the static bundle. Changing it requires a rebuild.

### Smoke tests
1. Open `https://<your-vercel>.vercel.app` → header should show **API: ok**.
2. Upload a PDF/DOCX/TXT → preview text appears.
3. Click **Generate** → slides render; in DevTools, verify response has `x-request-id`.

### CORS reminder
If the UI can’t reach the API, add your Vercel origin to backend CORS:
- Either `ALLOW_ALL_CORS=true` (temporarily)  
- Or `CORS_ALLOW_ORIGINS=["https://<your-vercel>.vercel.app"]`

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
The Docker production build uses **.env.production**. For local, override with:
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
- If `(blocked by CORS)`, set `ALLOW_ALL_CORS=true` or add your origin.

**Hitting Render from local unintentionally**  
- Add `frontend/.env.production.local` with the local base and rebuild the frontend image.

**Render build fails (Rust/maturin/watchfiles)**  
- Remove deps requiring Rust build; pin Python **3.11**.

**404 on /health**  
- Remember the prefix: `/v1/health`.

**502 on Render**  
- Wait for cold start; check Render Logs. Confirm **Start command** and **Health path** are correct.

**Correlate errors**  
- Copy the `x-request-id` from UI (we surface it) and search logs (Render or `docker compose logs`) for the same id.

---

## Post-deploy checklist

- [ ] Backend: `/v1/health` returns 200 with `x-request-id`.
- [ ] Backend: `/v1/outline` returns a Deck with `version: "1.0"`.
- [ ] Frontend: shows **API: ok**, upload + generate work.
- [ ] CORS: Vercel origin allowed (or ALLOW_ALL_CORS temporarily).
- [ ] Env parity documented in repo (`docs/DEPLOY.md`).

---

## Rollback

- **Render:** Deploy previous commit from the “Events” tab (or Git revert).
- **Vercel:** Redeploy a previous build from Deployments → “Redeploy”.

---

## URLs (fill in for your project)

- **Render (API):** `https://presentuneai.onrender.com/v1`
- **Vercel (UI):** `https://presentuneai.vercel.app`