import type { Context, Env } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { createMiddleware } from "hono/factory";

import { sanitizeEmail } from "@/server/emailAddress.ts";
import { isTest } from "@/server/environment.ts";
import { InternalError, TooManyRequestsError } from "@/server/errors/index.ts";

import type { ApiKeyContext } from "./apiKey.ts";

type KeyGenerator = NonNullable<Parameters<typeof rateLimiter>[0]["keyGenerator"]>;

const noop = createMiddleware(async (_, next) => next());

/** The requester's IP address, as the proxy in front of the app forwards it. */
function getClientIp(c: { req: { header: (name: string) => string | undefined } }) {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "unknown";
}

/** At most `limit` requests per `windowMs` of those `keyGenerator` counts together; past it, `TooManyRequestsError`. */
function limitBy<E extends Env>(
  { windowMs, limit }: { limit: number; windowMs: number },
  keyGenerator: (c: Context<E>) => Promise<string> | string,
) {
  return rateLimiter<E>({
    windowMs,
    limit,
    standardHeaders: "draft-6",
    keyGenerator,
    handler: () => {
      throw new TooManyRequestsError();
    },
  });
}

/** The requester's email address, for the routes that send one an email; other requests aren't counted together. */
async function emailKey(c: Parameters<KeyGenerator>[0]): Promise<string> {
  if (c.req.method !== "POST" && c.req.method !== "PUT") return `skip:${crypto.randomUUID()}`;

  try {
    const body = await c.req.json();
    if (body && typeof body.emailAddress === "string") return `email:${sanitizeEmail(body.emailAddress)}`;
  } catch {
    // no JSON body
  }

  return `skip:${crypto.randomUUID()}`;
}

/**
 * At most `limit` requests per `windowMs` from each client IP, or `per` email address; past it,
 * `TooManyRequestsError`. Off in the tests, whose requests share an IP.
 */
export function limitRate(
  { per = "ip", ...options }: { limit: number; per?: "email" | "ip"; windowMs: number },
  enabled = !isTest(),
) {
  if (!enabled) return noop;
  return limitBy(options, per === "email" ? emailKey : getClientIp);
}

/**
 * At most `limit` requests per `windowMs` with each API key, or `per` user its keys act as: the key the public API's
 * sign-in (`apiKey.ts`) found, which runs before. Past it, `TooManyRequestsError`. Off in the tests.
 */
export function limitRatePerKey(
  { per = "key", ...options }: { limit: number; per?: "key" | "user"; windowMs: number },
  enabled = !isTest(),
) {
  if (!enabled) return noop;
  return limitBy<ApiKeyContext>(options, (c) => {
    // The sign-in sets it: a limit on a route without it is the code's mistake, which the tests' disabled limits miss
    const key = c.var.requestApiKey;
    if (!key) throw new InternalError("A per-key rate limit runs after the API key's sign-in");
    return per === "user" ? `user:${key.userId}` : `key:${key.id}`;
  });
}
