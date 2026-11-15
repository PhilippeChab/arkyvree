import { afterAll, describe, expect, test } from "bun:test";

import { startEmailSetupPage, startUpdatingPage } from "@/server/noticePages.ts";

const PROBLEM = "SMTP_TLS is <always>: it's implicit, starttls, none";

const server = startEmailSetupPage(PROBLEM, { hostname: "127.0.0.1", port: 0 });

const updating = startUpdatingPage({ hostname: "127.0.0.1", port: 0 });

afterAll(async () => {
  await server.stop(true);
  await updating.stop(true);
});

describe("the email setup page", () => {
  test("keeps the probes up, so ONCE keeps the install", async () => {
    for (const path of ["/up", "/health"]) expect((await fetch(new URL(path, server.url))).status).toBe(200);
  });

  test("answers every other path with what to do and what's missing, escaped", async () => {
    const response = await fetch(new URL("/sign-up", server.url));
    expect(response.status).toBe(503);
    const page = await response.text();
    expect(page).toContain("Arkyvree can't send email yet");
    expect(page).toContain("SMTP_TLS is &#60;always&#62;");
    expect(page).not.toContain("<always>");
  });
});

describe("the updating page", () => {
  test("keeps the probes up, and asks to come back shortly", async () => {
    expect((await fetch(new URL("/up", updating.url))).status).toBe(200);
    const response = await fetch(new URL("/campaigns", updating.url));
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("10");
    expect(await response.text()).toContain("Arkyvree is updating");
  });
});
