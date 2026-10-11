import { describe, expect, test } from "bun:test";

import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { ApiError } from "@/client/src/services/ApiError.ts";
import { apiFetch } from "@/client/src/services/apiFetch.ts";

/** The API, which answers its errors in JSON, behind a proxy that answers `/proxy` with a page of its own. */
function serveApi() {
  return Bun.serve({
    port: 0,
    fetch: (request) =>
      new URL(request.url).pathname === "/proxy"
        ? new Response("<html>Bad Gateway</html>", { status: 502, headers: { "Content-Type": "text/html" } })
        : Response.json({ error: "ConflictError", message: "Name taken" }, { status: 409 }),
  });
}

/** What `apiFetch` throws for a request to `url`. */
async function failureOf(url: URL) {
  const error = await apiFetch(url).then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof ApiError)) throw new Error(`${url.pathname} answered without an ApiError`);
  return error;
}

describe("A failed API request", () => {
  test("says the server's message, else what failed", async () => {
    const server = serveApi();
    try {
      const api = await failureOf(new URL("/api", server.url));
      const proxy = await failureOf(new URL("/proxy", server.url));
      expect([api.status, api.errorName, errorMessage(api, "Failed to save item")]).toEqual([
        409,
        "ConflictError",
        "Name taken",
      ]);
      expect([proxy.status, proxy.errorName, errorMessage(proxy, "Failed to save item")]).toEqual([
        502,
        "UnknownError",
        "Failed to save item",
      ]);
    } finally {
      await server.stop(true);
    }
  });
});
