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

---

## Addendum: More Scenarios & Fixes (2025-09-03)

### 13) Export 404 / “Export not found” right after export
- Use `GET /v1/export/_debug/list` to see where files are stored.
- The API now *normalizes* files into `data/exports`, but if discovery fails you’ll see 404.
  Confirm the file exists in one of:
  - `/app/data/exports` (canonical)
  - `/app/data/uploads/exports` (legacy)
  - process CWD or `/tmp` (rare)
- Also check whether retention removed the file (see **config.md → retention**).

### 14) Assets endpoint 500 with JSONDecodeError
- Older runs could leave a truncated `index.json`. The loader is now tolerant and returns `[]`
  instead of 500. If you’re on an older image, remove or recreate the file:
  ```bash
  rm -f backend/data/uploads/<upload_id>/assets/index.json
  ```

### 15) Media Library image doesn’t export (AI placeholder works)
- Ensure the image URL is public and doesn’t require cookies/referrers.
- Editor export reads image **layers**; verify the slide actually has `media` items
  (the UI’s “Add from Library” button now **appends** instead of **replacing**).
- The exporter normalizes images via Pillow; make sure `Pillow` is installed (it is via
  `python-pptx` dependency) and the format is supported.

### 16) “Open in Google Slides” button disabled
- The button is gated by the presence of `GOOGLE_CLIENT_ID` in `/app-config.json`.
- Acquire a token via the popup; the code uses Drive scope `drive.file` (upload only).
- If popup is blocked, allow popups for `localhost`.

### 17) Finalize section didn’t trigger export
- The Finalize section now kicks off export automatically on first mount (if an editor doc exists).
- While exporting, **download buttons stay disabled** until the export completes.

### 18) Exports folder confusion
- Exports live in `/app/data/exports`. Uploads live in `/app/data/uploads`.
- The route `/v1/export/{filename}` **discovers** files by name across known roots and
  normalizes them into the canonical folder.

### 19) Windows volume mappings
Use relative paths in `docker-compose.yml`:
```yaml
volumes:
  - ./backend/app/static:/app/app/static
  - ./backend/data/uploads:/app/data/uploads
```

### 20) sbt / pdffigures2 build errors
If you enable the Scala-based figure extractor, install `sbt` (via Coursier) **inside the build stage**.
By default, the system falls back to Python-based DOCX/PDF extraction and doesn’t require `sbt`.

### 422: media.source literal_error
**Symptom**
`Input should be 'asset' or 'external'` for `slides[i].media[j].source`.

**Fix**
Ensure frontend writes `source: "asset"` for library picks and `source: "external"` for URLs/data URLs. UI-only tags (`"library"|"generated"`) must **not** be sent to backend.

### 422: paragraph string_too_short
**Symptom**
Earlier builds required `ParagraphSection.text` to be non-empty.

**Fix**
Slides may have `meta.sections = null`. When a user deletes the only section, send `meta: { "sections": null }` or omit it. Do not send an empty `paragraph` with `""` text.

### “image unavailable” in preview
Usually happens when the image URL is not reachable from the browser (e.g., private blob). Library assets should resolve via your asset server. AI images returned as `data:image/png;base64,…` will render inline.
