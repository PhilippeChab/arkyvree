import { expect, test } from "bun:test";

import { Hono } from "hono";

import { requestLogger } from "@/server/middlewares/index.ts";
import signedOut from "@/server/routers/authentication/signedOut/index.ts";

/** The lines `run` logs (`console.log`, which the request log writes with), kept out of the test's own output. */
async function readLoggedLines(run: () => Promise<unknown>) {
  const lines: string[] = [];
  const log = console.log;
  console.log = (...parts: unknown[]) => lines.push(parts.join(" "));
  try {
    await run();
  } finally {
    console.log = log;
  }
  return lines;
}

test("an invite link's token never reaches the request log: it travels in the body, which the log leaves out", async () => {
  const app = new Hono().use(requestLogger(true)).route("/auth", signedOut);
  const token = `arki_${crypto.randomUUID()}`;
  const lines = await readLoggedLines(async () => {
    const response = await app.request("/auth/invite-links/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    expect(response.status).toBe(200);
  });

  expect(lines.some((line) => line.includes("/auth/invite-links/state"))).toBe(true);
  expect(lines.some((line) => line.includes(token))).toBe(false);
});
