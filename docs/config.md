# Configuration

| Env var                     | Type   | Default        | Notes                                          |
|----------------------------|--------|----------------|------------------------------------------------|
| DEBUG                      | bool   | false          | If false, upload `path` is hidden in response |
| API_BASE                   | string | `/v1`          | Server mount prefix                            |
| ALLOW_ALL_CORS             | bool   | true (dev)     | If false, use CORS_ALLOW_ORIGINS               |
| CORS_ALLOW_ORIGINS         | list   | []             | Allowed origins                                |
| STORAGE_DIR                | path   | `data/uploads` | Upload storage                                 |
| MAX_UPLOAD_MB              | int    | 25             | Upload cap                                     |
| ENABLE_RETENTION           | bool   | true           | Background cleanup loop                        |
| RETENTION_DAYS             | int    | 1              | TTL for uploads                                |
| RETENTION_SWEEP_MINUTES    | int    | 30             | Sweep interval                                 |

Frontend:
- `VITE_API_BASE` → e.g. `http://localhost:8000/v1` in dev, `/v1` in prod behind same origin.
