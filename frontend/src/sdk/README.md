# PresenTuneAI Frontend SDK

Thin, typed helpers around `lib/api.ts`:
- `outline`, `outlineWithMeta`
- `regenerateSlide`, `regenerateSlideWithMeta`
- `exportDeck`
- `schema.deck`, `schema.slide`
- `health`, `healthWithMeta`
- `API_BASE`, `ApiError`, `ApiMeta`
- Types: `Deck`, `Slide`, `OutlineRequest`, `ExportResp`

Usage:
```ts
import { outline, type OutlineRequest, type Deck } from "../sdk";
const req: OutlineRequest = { topic: "AI Hackathon", slide_count: 5 };
const deck: Deck = await outline(req);
