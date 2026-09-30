import type { BrowserContext, Page } from '@playwright/test';
import { hc } from 'hono/client';
import type { Application } from '@/server/routers/application.ts';

/**
 * The app's typed API, through the browser context of `page`: its requests carry the context's cookies, and a
 * sign-in's response signs the context in. Setup goes through it, so a journey clicks through only what it tests.
 */
export function apiOf(page: Page | BrowserContext) {
  const { request } = page;
  return hc<Application>(process.env.E2E_BASE_URL!, {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await request.fetch(input instanceof Request ? input.url : input.toString(), {
        method: init?.method ?? 'GET',
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        data: typeof init?.body === 'string' ? init.body : undefined,
      });
      return new Response(response.status() === 204 ? null : new Uint8Array(await response.body()), {
        status: response.status(),
        headers: response.headers(),
      });
    },
  });
}
