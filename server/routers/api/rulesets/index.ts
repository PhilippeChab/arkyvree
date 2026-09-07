import { toJson } from "@/server/errors/index.ts";
import { denyDemoUser, sessionMiddleware } from "@/server/middlewares/index.ts";
import abilities from "@/server/routers/api/rulesets/abilities/index.ts";
import aptitudes from "@/server/routers/api/rulesets/aptitudes/index.ts";
import classes from "@/server/routers/api/rulesets/classes/index.ts";
import contributorsRouter from "@/server/routers/api/rulesets/contributors/index.ts";
import modifiers from "@/server/routers/api/rulesets/customization/modifiers/index.ts";
import properties from "@/server/routers/api/rulesets/customization/properties/index.ts";
import requirements from "@/server/routers/api/rulesets/customization/requirements/index.ts";
import targetRouter from "@/server/routers/api/rulesets/customization/target/index.ts";
import feats from "@/server/routers/api/rulesets/feats/index.ts";
import items from "@/server/routers/api/rulesets/items/index.ts";
import languages from "@/server/routers/api/rulesets/languages/index.ts";
import mechanics from "@/server/routers/api/rulesets/mechanics/index.ts";
import races from "@/server/routers/api/rulesets/races/index.ts";
import saves from "@/server/routers/api/rulesets/saves/index.ts";
import skills from "@/server/routers/api/rulesets/skills/index.ts";
import powers from "@/server/routers/api/rulesets/powers/index.ts";
import { limit, page } from "@/server/routers/api/validation.ts";
import RulesetsService from "@/server/services/RulesetsService.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

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
  .post(
    "/:id/fork",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
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

      const rulesetsService = RulesetsService.initialize();
      const result = await rulesetsService.call(
        "forkRuleset",
        c.var.requestSession,
        id,
        body,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 201);
    },
  )
  .post(
    "/:id/archive",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");

      const rulesetsService = RulesetsService.initialize();
      const result = await rulesetsService.call("archiveRuleset", c.var.requestSession, id);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/:id/unarchive",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");

      const rulesetsService = RulesetsService.initialize();
      const result = await rulesetsService.call("unarchiveRuleset", c.var.requestSession, id);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json({ message: "Ruleset unarchived successfully" }, 200);
    },
  )
  .post(
    "/:id/publish",
    denyDemoUser,
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        kind: z.enum(["ruleset", "extension"]).optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const rulesetsService = RulesetsService.initialize();
      const result = await rulesetsService.call("publishRuleset", c.var.requestSession, id, body);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/:id/star",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");

      const rulesetsService = RulesetsService.initialize();
      const result = await rulesetsService.call("starRuleset", c.var.requestSession, id);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json({ message: "Ruleset starred" }, 201);
    },
  )
  .delete(
    "/:id/star",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");

      const rulesetsService = RulesetsService.initialize();
      const result = await rulesetsService.call("unstarRuleset", c.var.requestSession, id);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json({ message: "Ruleset unstarred" }, 200);
    },
  )
  .put(
    "/:id",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string(),
        description: z.string(),
        private: z.boolean().optional(),
        kind: z.enum(["ruleset", "extension"]).optional(),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const rulesetsService = RulesetsService.initialize();
      const result = await rulesetsService.call(
        "updateRuleset",
        c.var.requestSession,
        id,
        body,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/:id/subscribe",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        extensionIds: z.array(z.string().uuid()).min(1),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const rulesetsService = RulesetsService.initialize();
      const result = await rulesetsService.call(
        "subscribeExtension",
        c.var.requestSession,
        id,
        body.extensionIds,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/:id/unsubscribe",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        extensionId: z.string().uuid(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const rulesetsService = RulesetsService.initialize();
      const result = await rulesetsService.call(
        "unsubscribeExtension",
        c.var.requestSession,
        id,
        body.extensionId,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/:id/entities/:entityType/:entityId/restore",
    zValidator("param", z.object({
      id: z.string().uuid(),
      entityType: z.enum(["saves", "skills", "feats", "powers", "items", "races", "languages", "klasses", "aptitudes", "mechanics"]),
      entityId: z.string().uuid(),
    })),
    async (c) => {
      const { id, entityType, entityId } = c.req.valid("param");

      const rulesetsService = RulesetsService.initialize();
      const result = await rulesetsService.call(
        "revertOverride",
        c.var.requestSession,
        id,
        entityType,
        entityId,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/:id/changes",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");

      const rulesetsService = RulesetsService.initialize();
      const result = await rulesetsService.call(
        "getChanges",
        c.var.requestSession,
        id,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/:id/extensions",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");

      const rulesetsService = RulesetsService.initialize();
      const result = await rulesetsService.call(
        "getSubscribedExtensions",
        c.var.requestSession,
        id,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/",
    zValidator(
      "query",
      z.object({
        scope: z.enum(["base", "forked", "community", "createdByMe", "createdByMePrivate", "archived", "published", "starred", "campaignAccessible", "myDrafts", "extensions", "systems", "contributedTo"])
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
      const result = await RulesetsService.initialize().call(
        "getAllRulesets",
        c.var.requestSession,
        {
          scope: query.scope,
          search: query.search,
          orderBy: query.orderBy,
          orderDir: query.orderDir,
        },
        { limit: query.limit, page: query.page },
      );
      if (!result[0]) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }
      return c.json(result[1], 200);
    },
  )
  .get(
    "/:id",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const result = await RulesetsService.initialize().call(
        "getRulesetById",
        c.var.requestSession,
        id,
      );
      if (!result[0]) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }
      return c.json(result[1], 200);
    },
  );

export default authenticatedRulesets;
