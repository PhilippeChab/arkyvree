import { createMiddleware } from "hono/factory";
import type { z } from "zod";

import { isProduction } from "@/server/environment.ts";
import { ForbiddenError, InternalError } from "@/server/errors/index.ts";

import type { ApiKeyContext } from "./apiKey.ts";

/**
 * What a public API route documents: what it does, and what it answers when it succeeds, its status and its body
 * (`response`, none for a 204), or the file it answers instead of JSON, by its media type (`file`: a PDF's
 * `application/pdf`, its `response` none). Its `effect`, when its method doesn't say it.
 */
export type RouteDescription = { effect?: RouteEffect; status: 200 | 201 | 202 | 204; summary: string } & (
  | { file: "application/pdf"; response: null }
  | { file?: never; response: z.ZodType | null }
);

/**
 * What a route does to what its user reaches: reads it, changes it, or removes something they won't get back as it was
 * (a record archived or deleted, a fork's changes discarded, their own access left). Its method says it (`readRouteEffect`)
 * but where a route's `effect` says otherwise: a POST that only reads (a plan answered, a path checked), or one that
 * removes.
 */
export type RouteEffect = "changes" | "reads" | "removes";

/** Whether a success answers what its route describes: its file's media type, or a JSON body its schema accepts. */
async function checkAnswer(response: Response, { file, response: schema }: RouteDescription) {
  if (file) {
    const type = response.headers.get("content-type") ?? "";
    if (!type.startsWith(file))
      throw new InternalError(`The route answers ${type}, which its description says is ${file}`);
    return;
  }
  if (!schema) return;
  const checked = schema.safeParse(await response.clone().json());
  if (!checked.success)
    throw new InternalError(`The route's answer isn't the one it describes: ${checked.error.message}`);
}

/**
 * A middleware that carries what its route documents (`description`), which the public API's document reads off its
 * routes (`server/routers/v1/`). It refuses a read-only key (`readOnly`) a route that does more than read
 * (`readRouteEffect`), before the route runs: every route describes itself, so none is left unguarded. Outside
 * production it checks each success the route answers against its description, so a test that calls the route fails
 * on an answer its document doesn't describe.
 */
export function describeRoute(description: RouteDescription) {
  const middleware = createMiddleware<ApiKeyContext>(async (c, next) => {
    if (c.var.readOnly && readRouteEffect(c.req.method, description) !== "reads")
      throw new ForbiddenError("This API key is read-only: it reads, and changes nothing");
    await next();
    if (isProduction() || !c.res.ok) return;
    if (c.res.status !== description.status)
      throw new InternalError(`The route answers ${c.res.status}, which its description says is ${description.status}`);
    await checkAnswer(c.res, description);
  });
  return Object.assign(middleware, { description });
}

/**
 * What a route of `method` does (`RouteEffect`): its description's `effect`, or its method's, a GET reading (and a
 * HEAD, which the router answers with the GET route, its body left out), a DELETE removing.
 */
export function readRouteEffect(method: string, { effect }: RouteDescription): RouteEffect {
  if (effect) return effect;
  const upper = method.toUpperCase();
  if (upper === "GET" || upper === "HEAD") return "reads";
  return upper === "DELETE" ? "removes" : "changes";
}
