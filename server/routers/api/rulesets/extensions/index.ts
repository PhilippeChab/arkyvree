import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, zValidator } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";

export default new Hono<SessionContext>()
  .post(
    "/:id/subscribe",
    zValidator("param", idParam),
    zValidator(
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
    zValidator("param", idParam),
    zValidator(
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
  )
  .get("/:id/extensions", zValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await RulesetExtensionsService.getSubscribedExtensions(c.var.requestSession, id), 200);
  });
