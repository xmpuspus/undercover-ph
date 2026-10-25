import { expect, it } from "vitest";
import type { Request } from "@playwright/test";
import { requestEvidence } from "./requestEvidence";

it.each(["url", "body", "headers"])("captures a history disclosure in request %s", async (surface) => {
  const history = "988877766655";
  const request = {
    url: () => surface === "url" ? `https://example.test/?streets=${history}` : "https://example.test/",
    postData: () => surface === "body" ? JSON.stringify({ streets: [[history, 1, 12102000, 1455000]] }) : null,
    allHeaders: async () => surface === "headers" ? { "x-run-history": history } : { accept: "application/json" },
  };
  expect(await requestEvidence(request as unknown as Request)).toContain(history);
});
