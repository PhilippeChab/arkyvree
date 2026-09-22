import { zValidator as honoZValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { z } from "zod";

import { BadRequestError } from "@/server/errors/index.ts";

// Use the application's error handler for validation failures so every API
// error has the same shape and Hono keeps inferring successful response bodies.
export function zValidator<T extends z.ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) {
  return honoZValidator(target, schema, (result) => {
    if (!result.success) {
      throw new BadRequestError("Request validation failed", {
        issues: result.error.issues.map((issue) => ({
          category: issue.path.map(String).join(".") || target,
          message: issue.message,
        })),
      });
    }
  });
}
