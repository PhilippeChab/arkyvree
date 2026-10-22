import { createMiddleware } from "hono/factory";
import type { z } from "zod";

import { isProduction } from "@/server/environment.ts";
import { InternalError } from "@/server/errors/index.ts";

/**
 * What a public API route documents: what it does, and what it answers when it succeeds, its status and its body
 * (`response`, none for a 204).
 */
export interface RouteDescription {
  response: z.ZodType | null;
  status: 200 | 201 | 204;
  summary: string;
}

/**
 * A middleware that carries what its route documents (`description`), which the public API's document reads off its
 * routes (`server/routers/v1/`). Outside production it checks each success the route answers against it, so a test
 * that calls the route fails on an answer its document doesn't describe.
 */
export function describeRoute(description: RouteDescription) {
  const middleware = createMiddleware(async (c, next) => {
    await next();
    if (isProduction() || !c.res.ok) return;
    if (c.res.status !== description.status)
      throw new InternalError(`The route answers ${c.res.status}, which its description says is ${description.status}`);
    if (!description.response) return;
    const checked = description.response.safeParse(await c.res.clone().json());
    if (!checked.success)
      throw new InternalError(`The route's answer isn't the one it describes: ${checked.error.message}`);
  });
  return Object.assign(middleware, { description });
}
