let lastArea: { type: "KEEP_AREA"; id: string; areas: string[]; files: string[] } | null = null;
let registrationStarted = false;

function sendArea(): void {
  if (lastArea) navigator.serviceWorker.controller?.postMessage(lastArea);
}

export function registerOffline(searchReady: Promise<unknown>): void {
  // Vite's development modules change on each edit. Register the built app only.
  if (!import.meta.env.PROD || !("serviceWorker" in navigator) || registrationStarted) return;
  registrationStarted = true;
  navigator.serviceWorker.addEventListener("controllerchange", sendArea);
  // Put the first search ahead of shell precaching and worker control. A failed search still allows installation.
  const register = () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: "none" }).catch(() => {
      // Browsing and routing still work when the browser does not allow offline storage.
    });
  };
  void searchReady.then(register, register);
}

export function keepOfflineArea(id: string, areas: string[], files: string[]): void {
  if (!("serviceWorker" in navigator)) return;
  lastArea = { type: "KEEP_AREA", id, areas, files: [
    `${import.meta.env.BASE_URL}data/areas.json`, `${import.meta.env.BASE_URL}data/search/top.json`, ...files,
  ] };
  sendArea();
}
