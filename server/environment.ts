/**
 * Whether the tests are running: `bun test` (tests/env.ts sets NODE_ENV) or the e2e server (playwright.config.ts).
 * They skip CSRF checks, rate limits and emails, and hash passwords cheaply, so it reads NODE_ENV alone, never the
 * database's name, and reads it when called: a test can step outside them (tests/emails/EmailService.test.ts).
 */
export const isTest = () => process.env.NODE_ENV === "test";
