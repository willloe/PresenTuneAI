# Configuration

This project is a small two–service monorepo:

- **Backend** — FastAPI (Python 3.11) with background housekeeping and simple observability.
- **Frontend** — Vite + React (static bundle).

Below is a complete list of knobs with practical defaults and notes on how they interact.

---

## Backend environment

> Put these in `backend/.env` for local Docker or configure on your host (e.g., Render).

| Env var                  | Type  | Default            | Notes |
|--------------------------|-------|--------------------|------|
| `ENV`                    | str   | `local`            | Free‑form (e.g., `local`, `staging`, `prod`) surfaced in logs. |
| `DEBUG`                  | bool  | `true`             | When `false`, certain debug fields (like absolute file paths) are hidden from responses. |
| `API_BASE`               | str   | `/v1`              | Prefix under which all routers are mounted (e.g., `/v1/health`). |
| `ALLOW_ALL_CORS`         | bool  | `false`            | If `true`, CORS allows `*` (useful for staging). Otherwise see `CORS_ALLOW_ORIGINS`. |
| `CORS_ALLOW_ORIGINS`     | list  | `[]`               | **JSON array string** of origins (e.g., `["http://localhost:5173"]`). Used when `ALLOW_ALL_CORS=false`. |
| `AUTH_ENABLED`           | bool  | `false`            | Turns on bearer token auth for all routes using `require_token`. |
| `API_TOKEN`              | str   | `dev-token`        | Static token to accept when `AUTH_ENABLED=true`. |
| `STORAGE_DIR`            | path  | `data/uploads`     | Root folder for uploads, generated editor/export artifacts, and temp files. Created at startup. |
| `MAX_UPLOAD_MB`          | int   | `20`               | Upload size cap; enforced by backend. |
| `ENABLE_RETENTION`       | bool  | `true`             | Runs a lightweight background worker that deletes old files under `STORAGE_DIR`. |
| `RETENTION_DAYS`         | int   | `1`                | Time‑to‑live for files in `STORAGE_DIR`. |
| `RETENTION_SWEEP_MINUTES`| int   | `30`               | How often the retention worker scans for expired files. |
| `FEATURE_USE_MODEL`      | bool  | `false`            | If `true`, outline generation calls an external agent service (see `AGENT_URL`). Otherwise uses a local placeholder strategy. |
| `AGENT_URL`              | str   | `http://agent:8001`| Base URL for the external outline agent (only used when `FEATURE_USE_MODEL=true`). |
| `AGENT_TIMEOUT_MS`       | int   | `10000`            | Timeout for agent calls. |
| `FEATURE_IMAGE_API`      | bool  | `true`             | Enables image enrichment. When `false`, the UI still works but skips enrichment calls. |
| `IMAGE_PROVIDER`         | enum  | `stub`             | `stub` or `pexels`. |
| `PEXELS_API_KEY`         | str   | —                  | Required only when `IMAGE_PROVIDER=pexels`. |
| `TIMING_ALLOW_ORIGIN`    | str   | `*`                | Controls the `Timing-Allow-Origin` header so browsers can display `Server‑Timing` in DevTools. |

### Static assets & layout library

- The backend **optionally** serves static files when the folder exists at `backend/app/static/`.
- The **layout library** is loaded from `backend/app/static/layouts/layouts.json` if present. If not, the API falls back to a built‑in minimal library (3 templates).  
  - You can hot‑reload the file at runtime with: `GET /v1/layouts?reload=true`.
  - Preview PNGs referenced by `preview_url` can live under `app/static/layouts/` as well (optional — the frontend can render previews directly from the JSON **without** PNGs).

> You do **not** need to create `app/static` for local development unless you want to override the built‑in layouts.

### Observability

- Every request gets an `x-request-id` (helpful for correlating logs).
- The middleware aggregates timing into a `Server‑Timing` header; browsers will only expose it if `TIMING_ALLOW_ORIGIN` allows your UI origin.

---

## Frontend environment

> The UI is a static bundle; it reads variables **at build time**.

| Var             | Where              | Example                          | Notes |
|-----------------|--------------------|----------------------------------|------|
| `VITE_API_BASE` | Vite build (env)   | `http://localhost:8000/v1`       | The API base URL compiled into the bundle. In production (e.g., Vercel), set it per‑environment and rebuild the site when it changes. |

### Local override for Dockerized UI

When running the Nginx production image locally you can force a local API by creating `frontend/.env.production.local`:

```env
VITE_API_BASE=http://localhost:8000/v1
```

Rebuild the UI image:

```bash
docker compose build --no-cache frontend
docker compose up -d frontend
```

---

## Quick reference: key endpoints

- `GET  /v1/health` — health & schema version.
- `POST /v1/outline` — outline (slides) from topic/text.
- `POST /v1/outline/{i}/regenerate` — regenerate a specific slide.
- `GET  /v1/layouts` — layout library (from JSON or built‑in). Supports `?reload=true`.
- `POST /v1/layouts/filter` — rank layouts given `{components: {text_count, image_count}, top_k}`.
- `POST /v1/editor/build` — build an EditorDoc from a Deck + layout selections. Supports `Idempotency-Key` header for safe retries.
- `POST /v1/export` — export to PPTX (or text fallback) and returns a path; `GET /v1/export/{filename}` serves the file.

---

## Example `.env` (backend)

```env
ENV=local
DEBUG=true

API_BASE=/v1

# CORS
ALLOW_ALL_CORS=true
# CORS_ALLOW_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]

# Auth (dev only)
AUTH_ENABLED=false
API_TOKEN=dev-token

# Storage
STORAGE_DIR=data/uploads
MAX_UPLOAD_MB=20

# Retention
ENABLE_RETENTION=true
RETENTION_DAYS=1
RETENTION_SWEEP_MINUTES=30

# Outline & images
FEATURE_USE_MODEL=false
AGENT_URL=http://agent:8001
AGENT_TIMEOUT_MS=10000

FEATURE_IMAGE_API=true
IMAGE_PROVIDER=stub
# PEXELS_API_KEY=your_pexels_key

# Observability
TIMING_ALLOW_ORIGIN=*
```

---

## Notes

- Values like `ALLOW_ALL_CORS` / `AUTH_ENABLED` are parsed by `pydantic` settings; use `true`/`false` (case‑insensitive).
- `CORS_ALLOW_ORIGINS` **must** be a valid JSON array string if you use it (the code `json.loads` it).

## Extra Information

- `AUTH_ENABLED` (`true|false`) and `API_TOKEN`. When auth is on, send `Authorization: Bearer <token>` from the frontend.  
- `CORS_ALLOW_ORIGINS` must include frontend origin(s).  
- `ENABLE_RETENTION`, `RETENTION_DAYS`, `RETENTION_SWEEP_MINUTES` affect `/export/{filename}` availability.  
- `FEATURE_IMAGE_API`, `IMAGE_PROVIDER` (`stub|pexels`), and provider keys.  
- Static assets: `app/static/layouts/layouts.json` must exist (see deploy notes).