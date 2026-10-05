export type EnvironmentVariable = keyof typeof VARIABLES;

/**
 * The server's environment, read in one place (`arkyvree/environment`): every variable it reads, and what for. A
 * variable is read when asked for, never kept, so a test that changes one is seen (tests/emails/EmailService.test.ts
 * steps outside the tests' NODE_ENV). A default belongs to the code that reads the variable.
 */

// oxfmt-ignore
const VARIABLES = {
  // Set on Fly with `fly secrets set` (docs/deployment.md says on which app)
  DATABASE_URL: "Postgres, through Neon's pooler",
  DIRECT_DATABASE_URL: "Postgres without the pooler: LISTEN/NOTIFY and the job queue's session features",
  RESEND_API_KEY: "sends email in production",
  SIGNING_SECRET: "signs attachment upload tokens",
  S3_BUCKET: "attachment storage", S3_ENDPOINT: "attachment storage", S3_ACCESS_KEY_ID: "attachment storage",
  S3_SECRET_ACCESS_KEY: "attachment storage", S3_PUBLIC_URL: "the public URL attachments are served from",
  GOOGLE_CLIENT_ID: "Google sign-in",
  APP_URL: "the app's public URL: CORS, the canonical host, the pages' meta",
  WORKER_FLYCAST_URL: "the worker's private URL, pinged to wake it for a new job",
  SENTRY_DSN: "server and worker error reporting", SENTRY_CLIENT_DSN: "browser error reporting",
  SENTRY_TRACES_SAMPLE_RATE: "the share of requests Sentry traces",
  OTEL_EXPORTER_OTLP_ENDPOINT: "where OpenTelemetry pushes metrics and logs", OTEL_AUTH_TOKEN: "its token",
  // Set by the platform, the scripts or a developer
  NODE_ENV: "production, test (tests/env.ts, the e2e server) or development (.env.example)",
  FLY_MACHINE_VERSION: "the release, set by Fly",
  HOST: "the address the server and the worker listen on", PORT: "the server's port", WORKER_PORT: "the worker's",
  DB_POOL_MAX: "the server's database pool", DB_POOL_MIN: "the server's database pool",
  WORKER_DB_POOL_MAX: "the worker's database pool",
  SMTP_HOST: "sends email in development (Mailpit, `bun dev:mail`)", SMTP_PORT: "its port",
  DISABLE_CACHE: "`true` turns the in-memory caches off",
  BUN_TEST_WORKER_ID: "a parallel test run's worker, whose own database it uses",
} as const;

/** The variables set on Fly: docs/deployment.md's table lists each (tests/environment.test.ts). */
// oxfmt-ignore
export const FLY_SECRETS = [
  "DATABASE_URL", "DIRECT_DATABASE_URL", "RESEND_API_KEY", "SIGNING_SECRET", "S3_BUCKET", "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_URL", "GOOGLE_CLIENT_ID", "APP_URL", "WORKER_FLYCAST_URL",
  "SENTRY_DSN", "SENTRY_CLIENT_DSN", "SENTRY_TRACES_SAMPLE_RATE", "OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_AUTH_TOKEN",
] as const satisfies EnvironmentVariable[];

/** What the server won't start in production without (server/main.ts). */
// oxfmt-ignore
export const REQUIRED_IN_PRODUCTION = [
  "APP_URL", "RESEND_API_KEY", "DATABASE_URL", "SIGNING_SECRET", "S3_BUCKET", "S3_ENDPOINT", "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_URL",
] as const satisfies EnvironmentVariable[];

/** A variable's value, undefined when it's unset. */
export const readEnv = (name: EnvironmentVariable): string | undefined => process.env[name];

export const isProduction = () => readEnv("NODE_ENV") === "production";

/**
 * Whether the tests are running: `bun test` (tests/env.ts sets NODE_ENV) or the e2e server (playwright.config.ts).
 * They skip CSRF checks, rate limits and emails, and hash passwords cheaply, so it reads NODE_ENV alone, never the
 * database's name.
 */
export const isTest = () => readEnv("NODE_ENV") === "test";

/**
 * A developer's machine: NODE_ENV=development, which .env.example sets. Explicit, never assumed: it shows an error's
 * details in responses and logs (server/errors), so an unset NODE_ENV keeps them masked.
 */
export const isDevelopment = () => readEnv("NODE_ENV") === "development";

/** The deployment's name for monitoring (Sentry, OpenTelemetry): NODE_ENV, or `development` when it's unset. */
export const getEnvironmentName = () => readEnv("NODE_ENV") || "development";
