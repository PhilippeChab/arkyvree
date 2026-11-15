import { describe, expect, test } from "bun:test";

import { createEmailTransports, readSmtpOptions } from "@/server/jobs/emailTransports.ts";
import { withEnvironment } from "@/tests/support/environment.ts";

/** The SMTP settings an instance's environment (`env`) reaches its server with, in production unless it says. */
async function readOptions(env: Record<string, string | undefined>) {
  return await withEnvironment(
    { NODE_ENV: "production", SMTP_TLS: undefined, SMTP_PORT: undefined, ...env },
    async () => readSmtpOptions("smtp.example.com"),
  );
}

/** Which transports an environment (`env`) makes, outside the tests. */
async function readTransports(env: Record<string, string | undefined>) {
  const none = { RESEND_API_KEY: undefined, SMTP_ADDRESS: undefined, SMTP_HOST: undefined };
  return await withEnvironment({ NODE_ENV: "production", ...none, ...env }, async () => {
    const { resend, smtpTransport } = createEmailTransports();
    return { resend: !!resend, smtp: !!smtpTransport };
  });
}

describe("the SMTP server's settings", () => {
  test("production reaches port 587 with STARTTLS required, and signs in when a user is set", async () => {
    expect(await readOptions({ SMTP_USERNAME: "ada", SMTP_PASSWORD: "secret" })).toEqual({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: "ada", pass: "secret" },
    });
  });

  test("port 465 takes TLS from the start", async () => {
    expect(await readOptions({ SMTP_PORT: "465" })).toMatchObject({ port: 465, secure: true });
  });

  test("SMTP_TLS chooses: none for a relay that speaks no TLS, implicit on another port", async () => {
    expect(await readOptions({ SMTP_TLS: "none", SMTP_PORT: "25" })).toEqual({
      host: "smtp.example.com",
      port: 25,
      secure: false,
      ignoreTLS: true,
    });
    expect(await readOptions({ SMTP_TLS: "implicit", SMTP_PORT: "2465" })).toMatchObject({ secure: true });
    expect(readOptions({ SMTP_TLS: "always" })).rejects.toEqual(
      new Error("SMTP_TLS is always: it's implicit, starttls, none"),
    );
  });

  test("development reaches Mailpit's port, its TLS only when offered, and signs in to nothing", async () => {
    expect(await readOptions({ NODE_ENV: "development" })).toEqual({
      host: "smtp.example.com",
      port: 1025,
      secure: false,
    });
  });
});

describe("what sends an instance's email", () => {
  test("Resend with its key, an SMTP server with its address, neither without", async () => {
    expect(await readTransports({ RESEND_API_KEY: "re_1", SMTP_ADDRESS: "smtp.example.com" })).toEqual({
      resend: true,
      smtp: false,
    });
    expect(await readTransports({ SMTP_ADDRESS: "smtp.example.com" })).toEqual({ resend: false, smtp: true });
    expect(await readTransports({})).toEqual({ resend: false, smtp: false });
  });

  test("nothing in the tests, whatever is set", async () => {
    expect(await withEnvironment({ SMTP_HOST: "localhost" }, async () => createEmailTransports())).toEqual({
      resend: null,
      smtpTransport: null,
    });
  });
});
