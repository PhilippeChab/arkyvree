import { rateLimiter } from "hono-rate-limiter";
import { createMiddleware } from "hono/factory";

import { isTest } from "@/server/environment.ts";
import { TooManyRequestsError } from "@/server/errors/index.ts";

type KeyGenerator = NonNullable<Parameters<typeof rateLimiter>[0]["keyGenerator"]>;

const noop = createMiddleware(async (_, next) => next());

function getClientIp(c: { req: { header: (name: string) => string | undefined } }) {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "unknown";
}

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
export function limitRate(
  { windowMs, limit, per = "ip" }: { windowMs: number; limit: number; per?: "ip" | "email" },
  enabled = !isTest(),
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
