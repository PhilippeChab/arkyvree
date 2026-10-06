import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";

export default new Hono<SessionContext>()
  .get("/:id/extensions", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await RulesetExtensionsService.getExtensions(c.var.requestSession, id), 200);
  })
  .post(
    "/:id/subscribe",
    validate("param", idParam),
    validate(
      "json",
      z.object({
        extensionIds: z.array(z.string().uuid()).min(1),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        await RulesetExtensionsService.subscribeExtension(c.var.requestSession, id, body.extensionIds),
        200,
      );
    },
  )
  .post(
    "/:id/unsubscribe",
    validate("param", idParam),
    validate(
      "json",
      z.object({
        extensionId: z.string().uuid(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(
        await RulesetExtensionsService.unsubscribeExtension(c.var.requestSession, id, body.extensionId),
        200,
      );
    },
  );
