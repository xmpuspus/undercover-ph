export interface LoadProgress { loaded: number; total?: number }

/** Count the initial area's downloads as they stream, including hosts that omit a length. */
export function progressFetch(onProgress: (progress: LoadProgress) => void): typeof fetch {
  const parts: { loaded: number; total?: number }[] = [];
  const report = () => onProgress({
    loaded: parts.reduce((n, p) => n + p.loaded, 0),
    total: parts.every((p) => p.total !== undefined) ? parts.reduce((n, p) => n + p.total!, 0) : undefined,
  });
  return async (input, init) => {
    const response = await fetch(input, { cache: "no-cache", ...init });
    if (!response.ok || !response.body || response.headers.get("content-type")?.includes("text/html")) return response;
    const length = Number(response.headers.get("content-length"));
    // Content-Length describes compressed bytes when Content-Encoding is set. The stream is already decoded.
    const part = { loaded: 0, total: !response.headers.get("content-encoding") && length > 0 ? length : undefined };
    parts.push(part);
    report();
    const reader = response.body.getReader();
    return new Response(new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { value, done } = await reader.read();
          if (done) { controller.close(); return; }
          part.loaded += value.byteLength;
          report();
          controller.enqueue(value);
        } catch (error) { controller.error(error); }
      },
      cancel(reason) { return reader.cancel(reason); },
    }), { status: response.status, statusText: response.statusText, headers: response.headers });
  };
}

export function progressLabel(p: LoadProgress): string {
  if (p.total && p.total >= p.loaded) return `${Math.min(99, Math.floor(100 * p.loaded / p.total))}%`;
  return `${Math.round(p.loaded / 1024).toLocaleString()} KB`;
}
