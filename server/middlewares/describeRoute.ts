import { createMiddleware } from "hono/factory";
import type { z } from "zod";

import { isProduction } from "@/server/environment.ts";
import { InternalError } from "@/server/errors/index.ts";

/**
 * What a public API route documents: what it does, and what it answers when it succeeds, its status and its body
 * (`response`, none for a 204), or the file it answers instead of JSON, by its media type (`file`: a PDF's
 * `application/pdf`, its `response` none).
 */
export interface RouteDescription {
  file?: "application/pdf";
  response: z.ZodType | null;
  status: 200 | 201 | 202 | 204;
  summary: string;
}

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
 * routes (`server/routers/v1/`). Outside production it checks each success the route answers against it, so a test
 * that calls the route fails on an answer its document doesn't describe.
 */
export function describeRoute(description: RouteDescription) {
  const middleware = createMiddleware(async (c, next) => {
    await next();
    if (isProduction() || !c.res.ok) return;
    if (c.res.status !== description.status)
      throw new InternalError(`The route answers ${c.res.status}, which its description says is ${description.status}`);
    await checkAnswer(c.res, description);
  });
  return Object.assign(middleware, { description });
}
