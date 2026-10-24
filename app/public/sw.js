/* The Vite plugin replaces these values with the built asset list and its hash. */
const VERSION = "__BUILD_VERSION__";
const SHELL = ["__BUILD_SHELL__"];
const SHELL_CACHE = `ucph-shell-${VERSION}`;
const DATA_CACHE = "ucph-trip-v1";
const pending = new Map();
let keepArea = null;
let retainedAreas = new Set();
const loadingAreas = new Set();
let pruning = Promise.resolve();

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("ucph-shell-") && key !== SHELL_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

async function remember(cache, key, response) {
  const write = cache.put(key, response);
  pending.set(key, write);
  try { await write; } finally { if (pending.get(key) === write) pending.delete(key); }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || request.headers.has("range")) return;
  const shell = new URL("./", self.location.href);
  const relative = url.pathname.slice(shell.pathname.length);
  const navigation = request.mode === "navigate";
  const selected = /^data\/areas\/([a-z0-9-]+)\/graph\.cols\.json$/.exec(relative);
  if (selected) loadingAreas.add(selected[1]);
  const asset = relative.startsWith("assets/");
  const data = /^(?:data\/.*\.(?:json|bin|bin\.gz)|api\/.*)$/.test(relative);
  const shellFile = ["", "index.html", "shell.js", "manifest.webmanifest", "favicon.svg"].includes(relative) || /^(?:icons|poster)\//.test(relative);
  if (!navigation && !asset && !data && !shellFile) return;
  const indexKey = new URL("index.html", shell).href;
  // Files opened in a tab remain files. Only app navigations share the canonical document key.
  const appNavigation = navigation && (relative === "" || relative === "index.html");
  const key = appNavigation ? indexKey : request.url;
  const writing = [];
  const answer = (async () => {
    const cache = await caches.open(data ? DATA_CACHE : SHELL_CACHE);
    if (asset) {
      const hit = await cache.match(key);
      if (hit) return hit;
    }
    try {
      const response = await fetch(request, { cache: "no-cache" });
      const html = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "text/html";
      if (response.ok && response.status === 200 && (!appNavigation || html)) {
        const write = remember(cache, key, response.clone());
        writing.push(write);
      }
      return response;
    } catch (error) {
      // A navigation immediately after routing can race the last cache write.
      await pending.get(key)?.catch(() => {});
      const hit = await cache.match(key);
      if (hit) return hit;
      throw error;
    }
  })();
  event.respondWith(answer);
  event.waitUntil(answer.then(() => Promise.all(writing)).catch(() => {}));
});

self.addEventListener("message", (event) => {
  const message = event.data;
  if (message?.type !== "KEEP_AREA" || typeof message.id !== "string" || !/^[a-z0-9-]+$/.test(message.id)) return;
  const areas = message.areas ?? [message.id];
  if (!Array.isArray(areas) || areas.length > 2 || !areas.includes(message.id) || !areas.every((id) => typeof id === "string" && /^[a-z0-9-]+$/.test(id))) return;
  keepArea = message.id;
  retainedAreas = new Set(areas);
  for (const id of areas) loadingAreas.delete(id);
  const files = Array.isArray(message.files) ? message.files.slice(0, 32) : [];
  pruning = pruning.catch(() => {}).then(async () => {
    const cache = await caches.open(DATA_CACHE);
    // The first trip may finish before installation claims the page. Cache any files it missed.
    await Promise.allSettled(files.map(async (file) => {
      if (typeof file !== "string") return;
      const url = new URL(file, self.location.href);
      const base = new URL("./data/", self.location.href);
      if (url.origin !== self.location.origin || !url.pathname.startsWith(base.pathname)) return;
      if (await cache.match(url.href)) return;
      const response = await fetch(url.href, { cache: "no-cache" });
      if (response.ok && response.status === 200 && !response.headers.get("content-type")?.includes("text/html")) await remember(cache, url.href, response);
    }));
    await Promise.allSettled([...pending.values()]);
    for (const key of await cache.keys()) {
      const area = /\/data\/areas\/([^/]+)\//.exec(new URL(key.url).pathname)?.[1];
      if (area && area !== keepArea && !retainedAreas.has(area) && !loadingAreas.has(area)) await cache.delete(key);
    }
  });
  event.waitUntil(pruning);
});
