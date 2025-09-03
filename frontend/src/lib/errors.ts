export class ApiError extends Error {
  status: number;
  url: string;
  requestId?: string;
  serverTiming?: string | null;
  detail?: unknown;

  constructor(
    message: string,
    opts: {
      status: number;
      url: string;
      requestId?: string | null;
      serverTiming?: string | null;
      detail?: unknown;
    }
  ) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status;
    this.url = opts.url;
    this.requestId = opts.requestId ?? undefined;
    this.serverTiming = opts.serverTiming ?? null;
    this.detail = opts.detail;
  }
}
