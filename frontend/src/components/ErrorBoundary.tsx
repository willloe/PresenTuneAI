import React from "react";
import { ApiError } from "../lib/api";

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (err: unknown, info?: React.ErrorInfo) => void;
  onReset?: () => void;
};

type State = { error: unknown | null };

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const err = this.state.error;
    if (!err) return this.props.children;

    if (err instanceof ApiError) {
      return (
        <div className="m-6 rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-lg font-semibold">Request failed</div>
          <p className="mt-2 text-sm text-gray-700 break-words">{err.message}</p>
          <div className="mt-2 text-xs text-gray-500 space-y-1">
            <div>Status: {err.status}</div>
            <div>URL: {err.url}</div>
            {err.requestId ? <div>Request ID: {err.requestId}</div> : null}
            {err.serverTiming ? <div>server-timing: {err.serverTiming}</div> : null}
          </div>
          <button onClick={this.reset} className="mt-3 rounded-lg border px-3 py-1 text-sm hover:bg-gray-50">
            Try again
          </button>
        </div>
      );
    }

    return this.props.fallback ?? (
      <div className="m-6 rounded-2xl border bg-white p-6 shadow-sm">
        <div className="text-lg font-semibold">Something went wrong</div>
        <p className="mt-2 text-sm text-gray-600">An unexpected error occurred in the UI.</p>
        <button onClick={this.reset} className="mt-3 rounded-lg border px-3 py-1 text-sm hover:bg-gray-50">
          Try again
        </button>
      </div>
    );
  }
}
