import type { Request } from "@playwright/test";

/** Include headers from the browser process; URL and body checks alone miss header leaks. */
export async function requestEvidence(request: Request): Promise<string> {
  return JSON.stringify({ url: request.url(), body: request.postData(), headers: await request.allHeaders() });
}
