# Frontend (demo)

Flows:
1) **Upload** → shows filename, size, kind, pages, text preview
2) **Outline** → uses `topic` or uploaded `parsed.text`
3) **Export** → posts `deck.slides`, returns export path + size

Config:
- `VITE_API_BASE`: dev => `http://localhost:8000/v1`; prod => `/v1`

Developer notes:
- `api.ts` surfaces `x-request-id` and `server-timing` for easy debugging
- UI shows request id next to errors and preview header
