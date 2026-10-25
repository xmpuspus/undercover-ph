import { Component, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/jost/300.css";
import "@fontsource/jost/400.css";
import "@fontsource/jost/500.css";
import "@fontsource/jost/600.css";
import "./index.css";
import App from "./App";
import { registerOffline } from "./lib/offline";
import { primePlaceIndex } from "./lib/data";

const searchReady = primePlaceIndex();
// The error is retried by the search UI. It must not prevent mounting when offline support is unavailable.
void searchReady.catch(() => {});
registerOffline(searchReady);

// Each deploy renames the code files, and the daily rebuild deploys every morning. A tab opened before a deploy
// requests the old Navigate, Steps or About file, gets a 404, and React drops the page. Reload once to get the
// new build. The trip is in the URL fragment, so the reload keeps it. A second failure within a minute is a real
// outage, so the error card below shows instead of a reload loop.
const RELOAD_KEY = "ucph-reload-at";
window.addEventListener("vite:preloadError", (e) => {
  const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
  if (Date.now() - last < 60_000) return;
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  e.preventDefault();
  location.reload();
});

class AppBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-card bg-white p-5 text-[15px] text-ink shadow-card" role="alert" data-testid="app-error">
          <p>The app stopped on an error. Reload to open your trip again.</p>
          <button type="button" onClick={() => location.reload()} className="mt-4 min-h-11 w-full rounded-card bg-brand px-4 font-medium text-white">
            Reload
          </button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppBoundary>
      <App />
    </AppBoundary>
  </StrictMode>,
);
