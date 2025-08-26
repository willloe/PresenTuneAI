import React from "react";
import { ApiError } from "../lib/api";
import { useToast } from "./ui/Toast"; // keep in sync with your Toast hook path

type BaseProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onReset?: () => void;
  /** When any key changes while showing an error, the boundary auto-resets */
  resetKeys?: unknown[];
};

type InternalProps = BaseProps & { onError?: (err: unknown, info?: React.ErrorInfo) => void };
type State = { error: unknown | null };

function arraysChanged(a?: unknown[], b?: unknown[]) {
  if (a === b) return false;
  const al = a?.length ?? 0;
  const bl = b?.length ?? 0;
  if (al !== bl) return true;
  for (let i = 0; i < al; i++) if (a![i] !== b![i]) return true;
  return false;
}

/** Class boundary so React can call lifecycle error hooks */
class ErrorBoundaryCore extends React.Component<InternalProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  componentDidUpdate(prevProps: InternalProps) {
    if (this.state.error && arraysChanged(prevProps.resetKeys, this.props.resetKeys)) {
      this.reset();
    }
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (error instanceof ApiError) {
      const { status, url, requestId, serverTiming, detail } = error;
      return (
        <div
          className="m-6 rounded-2xl border bg-white p-6 shadow-sm"
          role="alert"
          aria-live="assertive"
        >
          <div className="text-lg font-semibold">Request failed</div>
          <p className="mt-2 text-sm text-gray-700 break-words">{error.message}</p>

          <div className="mt-2 text-xs text-gray-500 space-y-1">
            {typeof status === "number" && <div>Status: {status}</div>}
            {url && <div>URL: {url}</div>}
            {requestId && <div>Request ID: {requestId}</div>}
            {serverTiming && <div>server-timing: {serverTiming}</div>}
          </div>

          {typeof detail !== "undefined" && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm">Details</summary>
              <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-gray-50 p-3 text-xs border">
                {formatDetail(detail)}
              </pre>
            </details>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={this.reset}
              className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50"
            >
              Try again
            </button>
            <button
              onClick={() =>
                copyToClipboardSafe(
                  `${error.message}\nstatus=${status}\nurl=${url}\nrequestId=${requestId ?? ""}\nserver-timing=${serverTiming ?? ""}\n${formatDetail(detail)}`
                )
              }
              className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-50"
              title="Copy details"
            >
              Copy details
            </button>
          </div>
        </div>
      );
    }

    // Generic fallback
    return (
      this.props.fallback ?? (
        <div className="m-6 rounded-2xl border bg-white p-6 shadow-sm" role="alert" aria-live="assertive">
          <div className="text-lg font-semibold">Something went wrong</div>
          <p className="mt-2 text-sm text-gray-600">An unexpected error occurred in the UI.</p>
          <button
            onClick={this.reset}
            className="mt-3 rounded-lg border px-3 py-1 text-sm hover:bg-gray-50"
          >
            Try again
          </button>
        </div>
      )
    );
  }
}

/** Wrapper that hooks into the toast system */
export default function ErrorBoundary({ children, fallback, onReset, resetKeys }: BaseProps) {
  const { show } = useToast();

  function handleError(err: unknown) {
    if (err instanceof ApiError) {
      const { status, requestId, serverTiming } = err;
      const rid = requestId ? ` • req: ${requestId}` : "";
      const st = serverTiming ? ` • ${serverTiming}` : "";
      show({
        tone: "danger",
        title: `API ${status}`,
        description: `${err.message}${rid}${st}`,
        timeoutMs: 7000,
      });
    } else if (err instanceof Error) {
      show({
        tone: "danger",
        title: "Unexpected error",
        description: err.message,
        timeoutMs: 7000,
      });
    } else {
      show({
        tone: "danger",
        title: "Unexpected error",
        description: "An unknown error occurred.",
        timeoutMs: 7000,
      });
    }
  }

  return (
    <ErrorBoundaryCore
      fallback={fallback}
      onReset={onReset}
      onError={handleError}
      resetKeys={resetKeys}
    >
      {children}
    </ErrorBoundaryCore>
  );
}

/* utils */
function formatDetail(detail: unknown): string {
  try {
    if (detail == null) return "";
    if (typeof detail === "string") return detail;
    return JSON.stringify(detail, null, 2);
  } catch {
    return String(detail);
  }
}

async function copyToClipboardSafe(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {}
}
