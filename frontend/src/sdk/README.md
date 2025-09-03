# PresenTuneAI Frontend SDK

Thin, typed helpers around `lib/api.ts`:

- `outline`, `outlineWithMeta`
- `regenerateSlide`, `regenerateSlideWithMeta`
- `exportDeck`, `exportDownloadUrl`
- `health`, `healthWithMeta`
- `API_BASE`, `ApiError`, `ApiMeta`
- Types: `Deck`, `Slide`, `OutlineRequest`, `ExportResp`

## Installation

This SDK is part of the frontend workspace; no separate install is required. Import from `src/sdk` in your app code.

```ts
// Example
import { outline, type OutlineRequest, type Deck } from "../sdk";
```

## Usage

### Generate an outline

```ts
import { outline, type OutlineRequest, type Deck } from "../sdk";

const req: OutlineRequest = { topic: "AI Hackathon", slide_count: 5 };
const deck: Deck = await outline(req);
```

### Access request metadata (request id, server timing)

```ts
import { outlineWithMeta, type OutlineRequest, type ApiMeta } from "../sdk";
import type { Deck } from "../types/deck";

const { data: deck, meta }: { data: Deck; meta: ApiMeta } =
  await outlineWithMeta({ topic: "AI Hackathon", slide_count: 5 });

console.log(meta.requestId, meta.serverTiming);
```

### Regenerate a specific slide

```ts
import { regenerateSlide, type OutlineRequest } from "../sdk";
import type { Slide } from "../types/deck";

const idx = 2; // 0-based
const req: OutlineRequest = { topic: "AI Hackathon" };

const slide: Slide = await regenerateSlide(idx, req);
```

### Export and download

```ts
import { exportDeck, exportDownloadUrl, type ExportResp } from "../sdk";
import type { Deck } from "../types/deck";

const { data: info }: { data: ExportResp } = await exportDeck({
  slides: deck.slides,
  theme: "default",
});

// Build a client-accessible download URL for the server path
const url = exportDownloadUrl(info.path);
// <a href={url} download>Download</a>
```

## API Surface

- `health()`, `healthWithMeta()`
- `outline(req)`, `outlineWithMeta(req)`
- `regenerateSlide(index, req)`, `regenerateSlideWithMeta(index, req)`
- `exportDeck(payload)`
- `exportDownloadUrl(pathOrName)`

### Types

- `Deck`, `Slide` (from `src/types/deck`)
- `OutlineRequest` (from `src/sdk/types`)
- `ExportResp`, `ApiMeta` (re-exported from `src/lib/api`)

## Errors

All HTTP errors throw an `ApiError` with:

- `status`: HTTP status code
- `url`: request URL
- `requestId`: server-provided request id (if any)
- `serverTiming`: `Server-Timing` header (if any)
- `message`: constructed message (status text + server detail where available)

You can catch and surface `requestId` in a toast or error boundary.

```ts
import { outline, ApiError } from "../sdk";

try {
  await outline({ topic: "X" });
} catch (e) {
  if (e instanceof ApiError) {
    console.error("Request failed", e.status, e.requestId);
  } else {
    console.error("Unexpected error", e);
  }
}
```

## Notes

- `outlineWithMeta` / `regenerateSlideWithMeta` return `{ data, meta }` to expose request metadata.
- `exportDownloadUrl` accepts either a full server path or a file name and returns a client-facing URL.
