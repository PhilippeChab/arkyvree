import { describe, expect, test } from "bun:test";

import { NO_EMAIL_MESSAGE } from "@/server/emails/delivery.ts";
import { findEmailSetupProblem, findPendingEmailSetup, readEmailDelivery } from "@/server/emails/index.ts";
import { withEnvironment } from "@/tests/support/environment.ts";

/** Every variable the email setup reads, unset: what a case sets on top. */
const UNSET = {
  RESEND_API_KEY: undefined,
  SMTP_ADDRESS: undefined,
  SMTP_HOST: undefined,
  SMTP_PORT: undefined,
  SMTP_USERNAME: undefined,
  SMTP_PASSWORD: undefined,
  SMTP_TLS: undefined,
};

/** What keeps an install set up as `env` waiting, in production, the image's page on unless `env` says. */
async function readPending(env: Record<string, string | undefined>) {
  return await withEnvironment({ NODE_ENV: "production", EMAIL_SETUP_PAGE: "true", ...UNSET, ...env }, async () =>
    findPendingEmailSetup(),
  );
}

/** How an instance set up as `env` sends email, and what stops it starting, in production unless `env` says. */
async function readSetup(env: Record<string, string | undefined>) {
  return await withEnvironment({ NODE_ENV: "production", ...UNSET, ...env }, async () => ({
    delivery: readEmailDelivery(),
    problem: findEmailSetupProblem(),
  }));
}

describe("how an instance sends email", () => {
  test.each([
    ["Resend, with its key", { RESEND_API_KEY: "re_1" }, "resend"],
    [
      "Resend ahead of an SMTP server set as well",
      { RESEND_API_KEY: "re_1", SMTP_ADDRESS: "smtp.example.com" },
      "resend",
    ],
    ["an SMTP server, by ONCE's name", { SMTP_ADDRESS: "smtp.example.com" }, "smtp"],
    ["an SMTP server, by development's name", { NODE_ENV: "development", SMTP_HOST: "localhost" }, "smtp"],
    ["never Resend outside production", { NODE_ENV: "development", RESEND_API_KEY: "re_1" }, "none"],
  ] as const)("%s", async (_, env, delivery) => {
    expect((await readSetup(env)).delivery).toBe(delivery);
  });
});

describe("what stops an instance's start", () => {
  test("production with no way to send email, named both ways", async () => {
    expect(await readSetup({})).toEqual({ delivery: "none", problem: NO_EMAIL_MESSAGE });
    expect(NO_EMAIL_MESSAGE).toContain("RESEND_API_KEY");
    expect(NO_EMAIL_MESSAGE).toContain("SMTP_ADDRESS or SMTP_HOST");
  });

  test("SMTP settings that reach no server, or a user without its password", async () => {
    expect((await readSetup({ SMTP_USERNAME: "ada", SMTP_PASSWORD: "secret" })).problem).toBe(
      `SMTP_USERNAME, SMTP_PASSWORD set without SMTP_ADDRESS or SMTP_HOST: ${NO_EMAIL_MESSAGE}`,
    );
    expect((await readSetup({ RESEND_API_KEY: "re_1", SMTP_PORT: "587" })).problem).toStartWith(
      "SMTP_PORT set without SMTP_ADDRESS",
    );
    expect((await readSetup({ SMTP_ADDRESS: "smtp.example.com", SMTP_USERNAME: "ada" })).problem).toBe(
      "SMTP_USERNAME and SMTP_PASSWORD go together: set both, or neither for a server that takes no sign-in",
    );
  });

  test("a TLS mode that isn't one, outside production too", async () => {
    expect((await readSetup({ SMTP_ADDRESS: "smtp.example.com", SMTP_TLS: "always" })).problem).toBe(
      "SMTP_TLS is always: it's implicit, starttls, none",
    );
    expect(
      (await readSetup({ NODE_ENV: "development", SMTP_HOST: "localhost", SMTP_TLS: "always" })).problem,
    ).toStartWith("SMTP_TLS is always");
  });

  test("nothing for Resend, a complete SMTP server, or development without either", async () => {
    expect((await readSetup({ RESEND_API_KEY: "re_1" })).problem).toBeUndefined();
    const smtp = { SMTP_ADDRESS: "smtp.example.com", SMTP_USERNAME: "ada", SMTP_PASSWORD: "secret", SMTP_TLS: "none" };
    expect((await readSetup(smtp)).problem).toBeUndefined();
    expect((await readSetup({ NODE_ENV: "development" })).problem).toBeUndefined();
  });
});

describe("a self-hosted install waiting for its email setup", () => {
  test("waits, with what's missing, when it can't send email", async () => {
    expect(await readPending({})).toBe(NO_EMAIL_MESSAGE);
    expect(await readPending({ SMTP_PORT: "587" })).toContain("SMTP_PORT set without SMTP_ADDRESS or SMTP_HOST");
  });

  test("doesn't wait once it can", async () => {
    expect(await readPending({ SMTP_ADDRESS: "smtp.example.com" })).toBeUndefined();
  });

  test("never waits outside the image: the start stops instead (findEmailSetupProblem)", async () => {
    expect(await readPending({ EMAIL_SETUP_PAGE: undefined })).toBeUndefined();
  });
});
