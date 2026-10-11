import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";

import { HttpClient } from "@/codegen/core/scraper/HttpClient.ts";
import { HttpError } from "@/codegen/core/scraper/HttpError.ts";

/**
 * How often a local server answering `statuses` in turn (then 200) is asked while `fetch` runs, and what `fetch` gives
 * (or throws).
 */
async function answered(statuses: number[], fetch: (url: string) => Promise<unknown>) {
  let requests = 0;
  const server = Bun.serve({
    port: 0,
    fetch() {
      const status = statuses[requests++] ?? 200;
      return new Response("<html><body></body></html>", { status });
    },
  });
  try {
    const result = await fetch(server.url.href).catch((error: unknown) => error);
    return { requests, result };
  } finally {
    await server.stop(true);
  }
}

/** When a local server received each request `fetch` makes of it. */
async function requestTimes(fetch: (url: string) => Promise<unknown>) {
  const times: number[] = [];
  const server = Bun.serve({
    port: 0,
    fetch() {
      times.push(Date.now());
      return new Response("<html><body></body></html>");
    },
  });
  try {
    await fetch(server.url.href);
    return times;
  } finally {
    await server.stop(true);
  }
}

describe("The scraper's HTTP client", () => {
  test("sends the requests made together one delay apart", async () => {
    const client = new HttpClient({ cacheDir: tmpdir(), noCache: true, delay: 200 });
    const times = await requestTimes((url) =>
      Promise.all([1, 2, 3].map((page) => client.fetchHtml(`${url}?page=${page}`))),
    );
    expect(times).toHaveLength(3);
    // The server sees when each request arrives, not when it was sent: a connection's setup delays the first one
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(150);
  });

  test("sends them at once with no delay", async () => {
    const client = new HttpClient({ cacheDir: tmpdir(), noCache: true, delay: 0 });
    const times = await requestTimes((url) =>
      Promise.all([1, 2, 3].map((page) => client.fetchHtml(`${url}?page=${page}`))),
    );
    expect(times.at(-1)! - times[0]).toBeLessThan(90);
  });

  test("doesn't ask again for a page the site doesn't have, and says it's missing", async () => {
    const client = new HttpClient({ cacheDir: tmpdir(), noCache: true, delay: 0 });
    const { requests, result } = await answered([404], (url) => client.fetchHtml(url));
    expect(requests).toBe(1);
    expect(result).toBeInstanceOf(HttpError);
    expect(result instanceof HttpError && result.status).toBe(404);
  });

  test("asks again when the site fails", async () => {
    const client = new HttpClient({ cacheDir: tmpdir(), noCache: true, delay: 0 });
    expect(await answered([503], (url) => client.fetchHtml(url))).toEqual({
      requests: 2,
      result: "<html><body></body></html>",
    });
  });
});
