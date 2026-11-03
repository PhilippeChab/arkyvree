import { zValidator as honoZValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { z } from "zod";

import { BadRequestError } from "@/server/errors/index.ts";

/** What a validation middleware checks: the public API's document reads it off its routes (`server/routers/v1/`). */
export interface Validation {
  schema: z.ZodType;
  target: keyof ValidationTargets;
}

/**
 * Use the application's error handler for validation failures so every API error has the same shape and Hono keeps
 * inferring successful response bodies. The middleware carries what it checks (`validation`), which documents it.
 */
export function validate<T extends z.ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) {
  const middleware = honoZValidator(target, schema, (result) => {
    if (!result.success) {
      throw new BadRequestError("Request validation failed", {
        issues: result.error.issues.map((issue) => ({
          category: issue.path.map(String).join(".") || target,
          message: issue.message,
        })),
      });
    }
  });
  const validation: Validation = { schema, target };
  return Object.assign(middleware, { validation });
}
