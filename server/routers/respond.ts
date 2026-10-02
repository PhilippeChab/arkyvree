import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { toJson } from "@/server/errors/index.ts";
import type { Result } from "@/server/services/BaseService.ts";

/** An error in the API's envelope, with its status: what a failed request answers. */
export function errorResponse(c: Context, err: Error) {
  const [error, code] = toJson(err);
  return c.json(error, code);
}

/** A service call's answer: its value as JSON with `status`, or its error in the API's envelope. */
export function respond<T, S extends ContentfulStatusCode>(c: Context, result: Result<T>, status: S) {
  if (!result[0]) return errorResponse(c, result[2]);
  return c.json(result[1], status);
}
