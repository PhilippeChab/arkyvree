import { describe, expect, test } from "bun:test";

import { HttpClient } from "@/codegen/dnd3.5/tools/scraper/HttpClient.ts";

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
    const client = new HttpClient({ noCache: true, delay: 200 });
    const times = await requestTimes((url) =>
      Promise.all([1, 2, 3].map((page) => client.fetchHtml(`${url}?page=${page}`))),
    );
    expect(times).toHaveLength(3);
    // The server sees when each request arrives, not when it was sent: a connection's setup delays the first one
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(150);
  });

  test("sends them at once with no delay", async () => {
    const client = new HttpClient({ noCache: true, delay: 0 });
    const times = await requestTimes((url) =>
      Promise.all([1, 2, 3].map((page) => client.fetchHtml(`${url}?page=${page}`))),
    );
    expect(times.at(-1)! - times[0]).toBeLessThan(90);
  });
});
