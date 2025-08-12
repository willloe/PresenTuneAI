# PresenTuneAI — Week 1 Checkpoint

This checkpoint includes:
- Upload → Parse (PDF/DOCX/TXT) → Outline stub → Export (txt)
- Observability middleware (request id, server timing, structured logs)
- Frontend demo (upload + outline + export)

## Quick start
```bash
docker compose up -d --build
# API at http://localhost:8000, UI at http://localhost:5173 (or your setup)
```

## Useful URLs
- OpenAPI JSON: `/openapi.json`
- Swagger UI: `/docs`
- Health: `GET /v1/health`
