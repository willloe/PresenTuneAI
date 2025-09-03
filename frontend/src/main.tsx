import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { ToastProvider } from "./components/ui/Toast";
import GlobalErrorCatcher from "./components/GlobalErrorCatcher";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToastProvider>
      <ErrorBoundary resetKeys={[location.pathname /* or step, deck?.id, etc. */]}>
        <GlobalErrorCatcher />
        <App />
      </ErrorBoundary>
    </ToastProvider>
  </React.StrictMode>
);
