import { rateLimiter } from "hono-rate-limiter";
import { createMiddleware } from "hono/factory";

import { hashApiKeyToken, readApiKeyToken } from "@/server/apiKeyTokens.ts";
import { sanitizeEmail } from "@/server/emailAddress.ts";
import { isTest } from "@/server/environment.ts";
import { TooManyRequestsError, UnauthorizedError } from "@/server/errors/index.ts";

type KeyGenerator = NonNullable<Parameters<typeof rateLimiter>[0]["keyGenerator"]>;

const noop = createMiddleware(async (_, next) => next());

/**
 * The API key the request is sent with, by its token's digest, as the database knows it: each key's requests are
 * counted together. The public API's sign-in (`apiKey.ts`) refused a request without a valid one before.
 */
function apiKeyKey(c: Parameters<KeyGenerator>[0]): string {
  const token = readApiKeyToken(c.req.header("authorization"));
  if (!token) throw new UnauthorizedError("Send an API key: `Authorization: Bearer <key>`");
  return `key:${hashApiKeyToken(token)}`;
}

/** The requester's IP address, as the proxy in front of the app forwards it. */
function getClientIp(c: { req: { header: (name: string) => string | undefined } }) {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || "unknown";
}

/** How requests are counted together: by client IP, by the email address a body sends, or by API key. */
function keyGeneratorOf(per: "email" | "ip" | "key"): KeyGenerator {
  switch (per) {
    case "email":
      return emailKey;
    case "ip":
      return getClientIp;
    case "key":
      return apiKeyKey;
  }
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
 * At most `limit` requests per `windowMs` from each client IP, `per` email address or `per` API key; past it,
 * `TooManyRequestsError`. Off in the tests, whose requests share an IP.
 */
export function limitRate(
  { windowMs, limit, per = "ip" }: { limit: number; per?: "email" | "ip" | "key"; windowMs: number },
  enabled = !isTest(),
) {
  if (!enabled) return noop;
  return rateLimiter({
    windowMs,
    limit,
    standardHeaders: "draft-6",
    keyGenerator: keyGeneratorOf(per),
    handler: () => {
      throw new TooManyRequestsError();
    },
  });
}
