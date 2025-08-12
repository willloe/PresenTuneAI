# Observability

## Middleware
- Assigns a per-request `x-request-id` (or honors incoming)
- Measures total app time and exposes `Server-Timing` header
- Propagates `request_id` to perf spans via ContextVar

### Response headers
- `x-request-id`: correlate client/server logs
- `x-response-time-ms`: total duration
- `server-timing`: e.g. `upload_stream;dur=93, parse_file;dur=5310, app;dur=5758`

## Logs (structured)
- Logger `http`: `request_complete`, `unhandled_error`
- Logger `perf`: `span` with fields: `span`, `duration_ms`, `request_id`, extra context (e.g., `file`, `content_type`)

### Emit spans
- Sync: `with span("name", key=value): ...`
- Async: `async with aspan("name", key=value): ...`

### Gotchas handled
- Avoid logging field names that collide with LogRecord (e.g., use `file_name` instead of `filename`)
- ContextVars set/reset once per request to avoid Token reuse errors

## Typical spans
- `outline_placeholder_generate` / `outline_placeholder_regenerate`
- `outline_generate` / `outline_generate_fallback`
- `agent_outline_request` / `agent_outline_response` (when FEATURE_USE_MODEL=true)
- `agent_regen_request` / `agent_regen_response`
- `image_enrich_deck` / `image_enrich_slide` (when FEATURE_IMAGE_API=true)
- `export_txt`

Use `with span("name", key=value)` or `async with aspan("name", key=value)`.