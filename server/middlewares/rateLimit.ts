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

type KeyGenerator = NonNullable<Parameters<typeof rateLimiter>[0]["keyGenerator"]>;

/** The requester's email address, for the routes that send one an email; other requests aren't counted together. */
const emailKey: KeyGenerator = async (c) => {
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
};

/**
 * At most `limit` requests per `windowMs` from each client IP, or `per` email address; past it,
 * `TooManyRequestsError`. Off in the tests, whose requests share an IP.
 */
export function rateLimit(
  { windowMs, limit, per = "ip" }: { windowMs: number; limit: number; per?: "ip" | "email" },
  enabled = !isTest,
) {
  if (!enabled) return noop;
  return rateLimiter({
    windowMs,
    limit,
    standardHeaders: "draft-6",
    keyGenerator: per === "email" ? emailKey : getClientIp,
    handler: () => {
      throw new TooManyRequestsError();
    },
  });
}

const MINUTE = 60 * 1000;

export const authRateLimit = rateLimit({ windowMs: 15 * MINUTE, limit: 15 });

export const authEmailRateLimit = rateLimit({ windowMs: 15 * MINUTE, limit: 10, per: "email" });

export const authSessionRateLimit = rateLimit({ windowMs: 15 * MINUTE, limit: 60 });

export const publicApiRateLimit = rateLimit({ windowMs: MINUTE, limit: 30 });

// Each direct-upload commits a blob row + S3 object that the sweep won't
// reclaim until UNATTACHED_BLOB_TTL_MS (shared/attachments.ts) after
// creation. Cap per-IP creation rate so a single scripted client can't
// bloat storage at will.
export const attachmentUploadRateLimit = rateLimit({ windowMs: MINUTE, limit: 20 });

export const exportRateLimit = rateLimit({ windowMs: MINUTE, limit: 5 });
