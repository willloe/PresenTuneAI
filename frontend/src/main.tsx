import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import App from "./App"; // now just the app flow
import ErrorBoundary from "./components/ErrorBoundary";
import { ToastProvider } from "./components/ui/Toast";
import GlobalErrorCatcher from "./components/GlobalErrorCatcher";
import Landing from "./components/Landing";
import "./index.css";

function BoundaryWrapper({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <ErrorBoundary resetKeys={[location.pathname]}>
      {children}
    </ErrorBoundary>
  );
}

function RootRouter() {
  return (
    <BrowserRouter>
      <BoundaryWrapper>
        <GlobalErrorCatcher />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<App />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BoundaryWrapper>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToastProvider>
      <RootRouter />
    </ToastProvider>
  </React.StrictMode>
);
