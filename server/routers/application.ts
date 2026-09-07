import { httpInstrumentationMiddleware } from "@hono/otel";
import { Hono } from "hono";
import { cors as buildCors } from "hono/cors";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { requestLogger } from "@/server/middlewares/index.ts";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { sql } from "drizzle-orm";

import { db } from "@/server/database/index.ts";
import { runWithRequestCache } from "@/server/database/requestCache.ts";
import { toJson } from "@/server/errors/index.ts";
import apiRouter from "@/server/routers/api.tsx";
import authenticationRouter from "@/server/routers/authentication/index.ts";
import staticRouter from "@/server/routers/static.ts";
import wsRouter from "@/server/routers/ws.ts";
import { broadcastNotificationsForActor, publishWsEvent } from "@/server/ws.ts";

const isDev = process.env.NODE_ENV !== "production";
const isTest = process.env.NODE_ENV === "test"
  || process.env.DATABASE_URL?.includes("test");

const origin = isDev
  ? ["http://localhost:5173"]
  : process.env.APP_URL ? [process.env.APP_URL] : [];

const cors = buildCors({
  origin,
  credentials: true,
  allowHeaders: ["Content-Type", "Authorization", "Cookie"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
});

// Canonical host for the app, parsed from APP_URL. Non-matching hosts (e.g.
// Fly's default `*.fly.dev`) are 301'd to the canonical origin so search
// engines consolidate authority at one URL. `/health` is exempt because Fly's
// probes hit it with the machine-name Host, not the public hostname. Disabled
// in dev because Vite's `changeOrigin: true` proxy rewrites the Host to the
// backend's, which would otherwise trigger an infinite redirect loop.
const enforceCanonicalHost =
  process.env.NODE_ENV === "production"
  && !!process.env.APP_URL;
const canonicalHost = enforceCanonicalHost
  ? new URL(process.env.APP_URL!).host
  : null;

const app = new Hono()
  .use("*", async (c, next) => {
    if (!canonicalHost) return next();
    if (c.req.path === "/health") return next();
    const host = c.req.header("host");
    if (!host || host === canonicalHost) return next();
    const url = new URL(c.req.url);
    return c.redirect(`https://${canonicalHost}${url.pathname}${url.search}`, 301);
  })
  .use("*", cors)
  .use("*", isTest ? async (_, next) => next() : csrf({ origin }))
  .use("*", httpInstrumentationMiddleware({ disableTracing: true }))
  .use("*", requestLogger())
  .use("*", requestId())
  // Specific public assets need CORP=cross-origin so Outlook web can render
  // them — Outlook loads <img src> directly into the outlook.live.com page
  // (no proxy like Gmail does), and the browser enforces our CORP header.
  // Default `same-origin` blocks the embed; whitelist only the assets we
  // actually need cross-origin (email logo + og:image).
  // Must run BEFORE secureHeaders so its post-next handler unwinds LAST and
  // wins the header. Anything not listed keeps the secure default.
  .use("*", async (c, next) => {
    await next();
    const CROSS_ORIGIN_ASSETS = new Set([
      "/pwa-192x192.png", // email logo
      "/pwa-512x512.png", // og:image
    ]);
    if (CROSS_ORIGIN_ASSETS.has(c.req.path)) {
      c.res.headers.set("Cross-Origin-Resource-Policy", "cross-origin");
    }
  })
  .use("*", secureHeaders({
    crossOriginOpenerPolicy: "same-origin-allow-popups",
  }))
  // Install a request-scoped query dedup store so repeated reads of the same
  // row/query within one request coalesce into a single DB round trip.
  .use("*", async (_, next) => runWithRequestCache(async () => { await next(); }))
  .get("/health", async (c) => {
    try {
      await db.execute(sql`SELECT 1`);
      return c.json({ status: "ok" });
    } catch {
      return c.json({ status: "unhealthy" }, 503);
    }
  })
  .route("/", wsRouter)
  .route("/auth", authenticationRouter)
  .use("/api/*", async (c, next) => {
    await next();
    if (["POST", "PUT", "DELETE"].includes(c.req.method) && c.res.ok) {
      try {
        const session = c.get("requestSession" as never) as { userId: string } | undefined;
        if (session) {
          publishWsEvent(session.userId, { type: "activities:updated" }).catch((err) =>
            console.error("[ws] Failed to publish event:", err),
          );
          broadcastNotificationsForActor(session.userId);
        }
      } catch {
        // Session middleware didn't run (e.g. unauthenticated route)
      }
    }
  })
  .route("/api", apiRouter)
  .route("/", staticRouter)
  .onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: "Forbidden", cause: "forbidden", message: "Forbidden" }, 403);
    }
    const [error, code] = toJson(err);
    return c.json(error, code);
  });

export type Application = typeof app;
export const application = app;
