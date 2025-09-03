# Troubleshooting

A quick guide to common issues during local development and deployment.

---

## 1) Backend won’t start: “Directory 'app/static' does not exist”

**Cause:** `main.py` mounts `/static` but the physical directory is missing.

**Fix:**
```bash
mkdir -p backend/app/static/layouts
# add your layouts.json and (optionally) thumbnails
```
In Docker, ensure the directory is copied or bind-mounted. See **deploy.md → Static assets**.

---

## 2) ImportError: cannot import name 'LIB' or 'get_layout_library'

**Cause:** `editor.py` used to import `LIB` directly; it now imports the *getter* `get_layout_library()`.

**Fix:** Ensure `app/api/v1/endpoints/layouts.py` exports:
```py
def get_layout_library() -> LayoutLibrary:
    return _LIB
```
And `editor.py` does:
```py
from app.api.v1.endpoints.layouts import get_layout_library
lib = get_layout_library()
```

---

## 3) Layouts not updating

**Symptoms:** Frontend still shows 3 default layouts; changes to `layouts.json` aren’t visible.

**Checklist:**
- Is `layouts.json` at `backend/app/static/layouts/layouts.json`?  
- Did you hit the reload route in dev?
  - `GET /v1/layouts?reload=true`
- If using Docker, is the file in the image (not just on the host)? Consider a **bind mount** for fast iteration.

---

## 4) Healthcheck failing in Docker

**Symptoms:** `docker compose` shows backend unhealthy.

**Possible causes & fixes:**
- Backend didn’t start due to a Python exception; run `docker compose logs -f backend` and fix the stacktrace (often static dir or import errors).
- Port conflicts on host. Change the host mapping in `docker-compose.yml` (`8000:8000` → `8001:8000`).

---

## 5) PPTX export missing an image on some slide

**Cause:** Source URL timed out or returned non-200.

**Fix:**
- Check that the image URL is reachable without auth and within ~12s.  
- For reliability, consider copying images to your own storage and using public URLs (no cookies, no referer restrictions).

---

## 6) CORS / auth mismatch

**Symptoms:** Frontend calls fail with CORS or 401.

**Fix:**
- For local dev, set in `.env`:
  - `AUTH_ENABLED=false` (no token required) **or**
  - `AUTH_ENABLED=true` and set `API_TOKEN=...`, then send `Authorization: Bearer ...` in frontend requests.
- Ensure `CORS_ALLOW_ORIGINS` includes your frontend origin (`http://localhost:5173`).

---

## 7) Windows + Docker path issues

**Symptoms:** File not found / static not mounted.

**Fix:** Prefer relative project paths in `docker-compose.yml` volumes. On Windows, ensure path separators and drive letters are correct. Example:
```yaml
volumes:
  - ./backend/app/static:/app/app/static
  - ./backend/data/uploads:/app/data/uploads
```

---

## 8) Frontend build errors (TypeScript)

**Examples:**
- `Cannot find module './ImageGalleryEditors'` → filename mismatch (singular vs plural).  
- Implicit `any` errors → add explicit `(url: string, alt?: string)` etc.  
- Union type mismatch for media → normalize to `{ type: "image" as const, url, alt }`.

**Fix:** Keep component names consistent and prefer strict types. See `frontend.md → Components` for canonical signatures.

---

## 9) Export fidelity not matching preview

**Checklist:**
- Are you using `editor` export (not `slides` fallback)? The editor export preserves exact frames.  
- Text size mapping is `pt = px * 0.75`. If your preview uses very small px values, PPTX may render tiny text.  
- `fit` matters: `cover` crops; switch to `contain` to avoid cropping.

---

## 10) Retention deletes exported files

**Symptoms:** Download link 404s after some time.

**Fix:** Set appropriate retention in `.env`:
```
ENABLE_RETENTION=true
RETENTION_DAYS=1
RETENTION_SWEEP_MINUTES=30
```
Tell users to download immediately after export, or disable retention in dev.

---

## 11) Layout recommendations don’t look right

**Cause:** The recommender uses simple heuristics (`text_min/max`, `images_min/max`, weight).

**Fix:**
- Ensure `supports` ranges in each layout reflect your intended content fit.  
- Pass correct `text_count` and `image_count` to `/layouts/filter`.  
- In the UI, `LayoutPicker` falls back to a local scoring function if the backend call fails.

---

## 12) “Image unavailable” in preview

**Cause:** Broken URL or CORS restrictions.

**Fix:** Click “Replace” and use a direct, public image URL. The preview component intentionally hides the broken-image icon and shows a friendly placeholder.
