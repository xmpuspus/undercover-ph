/** A cached file can outlive a deploy. Check availability once, without changing GET cache-first behavior. */
export function lazyChunk<T>(url: string, importModule: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => pending ??= (async () => {
    // Start both requests together. Capture rejection now so a fast failed import cannot become
    // unhandled while the availability check is still deciding whether to reload.
    const module = importModule().then((value) => ({ value }), (error: unknown) => ({ error }));
    if (import.meta.env.PROD && navigator.onLine !== false) {
      let response: Response | undefined;
      try {
        response = await fetch(url, { method: "HEAD", cache: "no-cache", signal: AbortSignal.timeout(3000) });
      } catch {
        // An offline connection, timeout or unsupported HEAD request still allows the cached import.
      }
      if (response?.status === 404 || response?.status === 410) {
        const error = new Error("An app file was removed by a deploy.");
        const event = new Event("vite:preloadError", { cancelable: true });
        Object.assign(event, { payload: error });
        window.dispatchEvent(event);
        // The existing handler reloads once. Avoid committing an error while that navigation starts.
        if (event.defaultPrevented) return new Promise<T>(() => {});
        throw error;
      }
    }
    const result = await module;
    if ("error" in result) throw result.error;
    return result.value;
  })();
}
