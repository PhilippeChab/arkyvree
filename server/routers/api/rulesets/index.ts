import { Hono } from "hono";
import { z } from "zod";

import { rulesetKind } from "@/drizzle/schema.ts";
import { denyDemoUser, sessionMiddleware, validate } from "@/server/middlewares/index.ts";
import abilities from "@/server/routers/api/rulesets/abilities/index.ts";
import aptitudes from "@/server/routers/api/rulesets/aptitudes/index.ts";
import changes from "@/server/routers/api/rulesets/changes/index.ts";
import classes from "@/server/routers/api/rulesets/classes/index.ts";
import contributorsRouter from "@/server/routers/api/rulesets/contributors/index.ts";
import modifiers from "@/server/routers/api/rulesets/customization/modifiers/index.ts";
import properties from "@/server/routers/api/rulesets/customization/properties/index.ts";
import requirements from "@/server/routers/api/rulesets/customization/requirements/index.ts";
import targetRouter from "@/server/routers/api/rulesets/customization/target/index.ts";
import extensions from "@/server/routers/api/rulesets/extensions/index.ts";
import feats from "@/server/routers/api/rulesets/feats/index.ts";
import items from "@/server/routers/api/rulesets/items/index.ts";
import languages from "@/server/routers/api/rulesets/languages/index.ts";
import mechanics from "@/server/routers/api/rulesets/mechanics/index.ts";
import powers from "@/server/routers/api/rulesets/powers/index.ts";
import races from "@/server/routers/api/rulesets/races/index.ts";
import saves from "@/server/routers/api/rulesets/saves/index.ts";
import skills from "@/server/routers/api/rulesets/skills/index.ts";
import { idParam, limit, page } from "@/server/routers/api/validation.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";

const authenticatedRulesets = new Hono()
  .use(sessionMiddleware)
  .route("/", contributorsRouter)
  .route("/", abilities)
  .route("/", aptitudes)
  .route("/", classes)
  .route("/", feats)
  .route("/", items)
  .route("/", languages)
  .route("/", mechanics)
  .route("/", powers)
  .route("/", races)
  .route("/", saves)
  .route("/", skills)
  .route("/", modifiers)
  .route("/", requirements)
  .route("/", properties)
  .route("/", targetRouter)
  .route("/", extensions)
  .route("/", changes)
  .get(
    "/",
    validate(
      "query",
      z.object({
        scope: z
          .enum([
            "base",
            "forked",
            "community",
            "createdByMe",
            "createdByMePrivate",
            "archived",
            "published",
            "starred",
            "campaignAccessible",
            "myDrafts",
            "extensions",
            "systems",
            "contributedTo",
          ])
          .optional(),
        search: z.string().optional(),
        orderBy: z.enum(["createdAt", "updatedAt"]).optional(),
        orderDir: z.enum(["asc", "desc"]).optional(),
        limit,
        page,
      }),
    ),
    async (c) => {
      const query = c.req.valid("query");
      return c.json(
        await RulesetsService.getRulesets(
          c.var.requestSession,
          {
            scope: query.scope,
            search: query.search,
            orderBy: query.orderBy,
            orderDir: query.orderDir,
          },
          { limit: query.limit, page: query.page },
        ),
        200,
      );
    },
  )
  .get("/:id", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await RulesetsService.getRuleset(c.var.requestSession, id), 200);
  })
  .post("/:id/archive", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await RulesetsService.archiveRuleset(c.var.requestSession, id), 200);
  })
  .post(
    "/:id/fork",
    validate("param", idParam),
    validate(
      "json",
      z.object({
        name: z.string(),
        description: z.string(),
        private: z.boolean(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await RulesetsService.forkRuleset(c.var.requestSession, id, body), 201);
    },
  )
  .post(
    "/:id/publish",
    denyDemoUser,
    validate("param", idParam),
    validate(
      "json",
      z.object({
        kind: z.enum(rulesetKind.enumValues).optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await RulesetsService.publishRuleset(c.var.requestSession, id, body), 200);
    },
  )
  .post("/:id/star", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    await RulesetsService.starRuleset(c.var.requestSession, id);
    return c.json({ message: "Ruleset starred" }, 201);
  })
  .post("/:id/unarchive", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    await RulesetsService.unarchiveRuleset(c.var.requestSession, id);
    return c.json({ message: "Ruleset unarchived successfully" }, 200);
  })
  .put(
    "/:id",
    validate("param", idParam),
    validate(
      "json",
      z.object({
        name: z.string(),
        description: z.string(),
        private: z.boolean().optional(),
        kind: z.enum(rulesetKind.enumValues).optional(),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await RulesetsService.updateRuleset(c.var.requestSession, id, body), 200);
    },
  )
  .delete("/:id/star", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    await RulesetsService.unstarRuleset(c.var.requestSession, id);
    return c.json({ message: "Ruleset unstarred" }, 200);
  });

export default authenticatedRulesets;
