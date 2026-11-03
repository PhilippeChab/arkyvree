import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1RulesetExtensions } from "@/server/routers/v1/schemas/rulesets.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";

const extensionParams = idParam.extend({ extensionId: z.string().uuid() });

/** The extensions a ruleset is subscribed to. */
export default new Hono<ApiKeyContext>()
  .get(
    "/:id/extensions",
    describeRoute({ response: v1RulesetExtensions, status: 200, summary: "The extensions a ruleset is subscribed to" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.rulesetExtensions(await RulesetExtensionsService.getExtensions(c.var.requestSession, id)), 200);
    },
  )
  .post(
    "/:id/extensions",
    describeRoute({
      response: v1RulesetExtensions,
      status: 200,
      summary: "Subscribes a ruleset to extensions, answering those it's subscribed to",
    }),
    validate("param", idParam),
    validate("json", z.object({ extensionIds: z.array(z.string().uuid()).min(1) })),
    async (c) => {
      const { id } = c.req.valid("param");
      const { extensionIds } = c.req.valid("json");
      await RulesetExtensionsService.subscribeExtension(c.var.requestSession, id, extensionIds);
      return c.json(V1.rulesetExtensions(await RulesetExtensionsService.getExtensions(c.var.requestSession, id)), 200);
    },
  )
  .delete(
    "/:id/extensions/:extensionId",
    describeRoute({
      response: v1RulesetExtensions,
      status: 200,
      summary: "Unsubscribes a ruleset from an extension, answering those it's still subscribed to",
    }),
    validate("param", extensionParams),
    async (c) => {
      const { extensionId, id } = c.req.valid("param");
      await RulesetExtensionsService.unsubscribeExtension(c.var.requestSession, id, extensionId);
      return c.json(V1.rulesetExtensions(await RulesetExtensionsService.getExtensions(c.var.requestSession, id)), 200);
    },
  );
