import type { BrowserContext, Page } from "@playwright/test";
import { hc } from "hono/client";

import type { Application } from "@/server/routers/application.ts";

/**
 * The app's typed API, through the browser context of `page`: its requests carry the context's cookies, and a
 * sign-in's response signs the context in. Setup goes through it, so a journey clicks through only what it tests.
 */
export function apiOf(page: Page | BrowserContext) {
  const { request } = page;
  return hc<Application>(process.env.E2E_BASE_URL!, {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body;
      if (body != null && typeof body !== "string" && !(body instanceof FormData))
        throw new Error("apiOf sends JSON and form bodies only");
      const response = await request.fetch(input instanceof Request ? input.url : input.toString(), {
        method: init?.method ?? "GET",
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        ...(body instanceof FormData ? { multipart: body } : { data: body ?? undefined }),
      });
      // Each header as sent: a response can set several cookies
      const headers = new Headers();
      for (const { name, value } of response.headersArray()) headers.append(name, value);
      return new Response(response.status() === 204 ? null : new Uint8Array(await response.body()), {
        status: response.status(),
        headers,
      });
    },
  });
}
