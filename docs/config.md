# Configuration

| Env var                 | Type   | Default           | Notes |
|-------------------------|--------|-------------------|-------|
| DEBUG                   | bool   | false             | Hide upload path when false |
| API_BASE                | str    | /v1               | Router mount prefix |
| CORS_ALLOW_ORIGINS      | list   | []                | JSON array string in env |
| STORAGE_DIR             | path   | data/uploads      | Upload storage root |
| MAX_UPLOAD_MB           | int    | 25                | Upload size cap |
| ENABLE_RETENTION        | bool   | true              | Clean old files |
| RETENTION_DAYS          | int    | 1                 | TTL for uploads |
| RETENTION_SWEEP_MINUTES | int    | 30                | Sweep interval |
| FEATURE_USE_MODEL       | bool   | false             | Use external agent for outline |
| AGENT_URL               | str    | http://agent:8001 | Agent base URL |
| AGENT_TIMEOUT_MS        | int    | 10000             | HTTP timeout |
| FEATURE_IMAGE_API       | bool   | true              | Enable image enrichment |
| IMAGE_PROVIDER          | enum   | stub              | `stub` or `pexels` |
| PEXELS_API_KEY          | str    | —                 | Required if provider=pexels |
| TIMING_ALLOW_ORIGIN     | str    | *                 | Allow Server‑Timing to be read by browsers |

Frontend:
- `VITE_API_BASE` → e.g. `http://localhost:8000/v1` in dev, `/v1` in prod behind same origin.

See `.env.example` for a starter.
