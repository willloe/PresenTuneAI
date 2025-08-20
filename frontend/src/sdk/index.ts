export * from "./types";
export {
  API_BASE,
  ApiError,
  type ApiMeta,
  health,
  healthWithMeta,
  outline,
  outlineWithMeta,
  regenerateSlide,
  regenerateSlideWithMeta,
  exportDeck,
  exportDownloadUrl,
} from "./client";

// Optional: convenient default export
import * as Client from "./client";

const sdk = {
  // health
  health: Client.health,
  healthWithMeta: Client.healthWithMeta,

  // outline
  outline: Client.outline,
  outlineWithMeta: Client.outlineWithMeta,

  // regenerate
  regenerateSlide: Client.regenerateSlide,
  regenerateSlideWithMeta: Client.regenerateSlideWithMeta,

  // export
  exportDeck: Client.exportDeck,
  exportDownloadUrl: Client.exportDownloadUrl,

  // constants / errors
  API_BASE: Client.API_BASE,
  ApiError: Client.ApiError,
};

export default sdk;
