import { rateLimiter } from "hono-rate-limiter";
import { createMiddleware } from "hono/factory";

import { TooManyRequestsError } from "@/server/errors/index.ts";

const isTest = process.env.NODE_ENV === "test"
  || process.env.DATABASE_URL?.includes("test");

const noop = createMiddleware(async (_, next) => next());

function getClientIp(c: { req: { header: (name: string) => string | undefined } }) {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
    || c.req.header("x-real-ip")
    || "unknown";
}

export const authRateLimit = isTest
  ? noop
  : rateLimiter({
      windowMs: 15 * 60 * 1000,
      limit: 15,
      standardHeaders: "draft-6",
      keyGenerator: (c) => getClientIp(c),
      handler: () => {
        throw new TooManyRequestsError();
      },
    });

export const authEmailRateLimit = isTest
  ? noop
  : rateLimiter({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: "draft-6",
      keyGenerator: async (c) => {
        if (c.req.method !== "POST" && c.req.method !== "PUT") {
          return `skip:${crypto.randomUUID()}`;
        }

        try {
          const body = await c.req.json();
          if (body && typeof body.emailAddress === "string") {
            return `email:${body.emailAddress.toLowerCase()}`;
          }
        } catch {
          // no JSON body
        }

        return `skip:${crypto.randomUUID()}`;
      },
      handler: () => {
        throw new TooManyRequestsError();
      },
    });

export const authSessionRateLimit = isTest
  ? noop
  : rateLimiter({
      windowMs: 15 * 60 * 1000,
      limit: 60,
      standardHeaders: "draft-6",
      keyGenerator: (c) => getClientIp(c),
      handler: () => {
        throw new TooManyRequestsError();
      },
    });

export const publicApiRateLimit = isTest
  ? noop
  : rateLimiter({
      windowMs: 60 * 1000,
      limit: 30,
      standardHeaders: "draft-6",
      keyGenerator: (c) => getClientIp(c),
      handler: () => {
        throw new TooManyRequestsError();
      },
    });

// Each direct-upload commits a blob row + S3 object that the sweep won't
// reclaim until UNATTACHED_BLOB_TTL_MS (shared/attachments.ts) after
// creation. Cap per-IP creation rate so a single scripted client can't
// bloat storage at will.
export const attachmentUploadRateLimit = isTest
  ? noop
  : rateLimiter({
      windowMs: 60 * 1000,
      limit: 20,
      standardHeaders: "draft-6",
      keyGenerator: (c) => getClientIp(c),
      handler: () => {
        throw new TooManyRequestsError();
      },
    });

export const exportRateLimit = isTest
  ? noop
  : rateLimiter({
      windowMs: 60 * 1000,
      limit: 5,
      standardHeaders: "draft-6",
      keyGenerator: (c) => getClientIp(c),
      handler: () => {
        throw new TooManyRequestsError();
      },
    });
