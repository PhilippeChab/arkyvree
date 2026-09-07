import { toJson } from "@/server/errors/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { SkillsService } from "@/server/services/rulesets/index.ts";
import { entityOrderBy, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

export default new Hono<SessionContext>()
  .get(
    "/:id/skills",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "query",
      z.object({
        limit,
        page,
        search: z.string().optional(),
        childOnly: z.coerce.boolean().optional(),
        orderBy: entityOrderBy,
        orderDir: orderDirAsc,
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { limit, page, search, childOnly, orderBy, orderDir } = c.req.valid("query");

      const skillsService = SkillsService.initialize();
      const result = await skillsService.call("getRulesetSkills", id, { search, childOnly, orderBy, orderDir }, { limit, page });
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .get(
    "/:id/skills/:skillId",
    zValidator("param", z.object({ id: z.string().uuid(), skillId: z.string().uuid() })),
    async (c) => {
      const { id, skillId } = c.req.valid("param");

      const skillsService = SkillsService.initialize();
      const result = await skillsService.call("getRulesetSkill", id, skillId);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .post(
    "/:id/skills",
    zValidator("param", z.object({ id: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z.string().optional().transform(v => v || null),
        primaryAbilityId: z.string().uuid(),
        impactedByWeight: z.boolean(),
        usableWithoutTraining: z.boolean(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const skillsService = SkillsService.initialize();
      const result = await skillsService.call("createRulesetSkill", c.var.requestSession, id, body);
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  )
  .put(
    "/:id/skills/:skillId",
    zValidator("param", z.object({ id: z.string().uuid(), skillId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z.string().optional().transform(v => v || null),
        primaryAbilityId: z.string().uuid(),
        impactedByWeight: z.boolean(),
        usableWithoutTraining: z.boolean(),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, skillId } = c.req.valid("param");
      const body = c.req.valid("json");

      const skillsService = SkillsService.initialize();
      const result = await skillsService.call(
        "updateRulesetSkill",
        c.var.requestSession,
        id,
        skillId,
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
  .delete(
    "/:id/skills/:skillId",
    zValidator("param", z.object({ id: z.string().uuid(), skillId: z.string().uuid() })),
    async (c) => {
      const { id, skillId } = c.req.valid("param");

      const skillsService = SkillsService.initialize();
      const result = await skillsService.call(
        "deleteRulesetSkill",
        c.var.requestSession,
        id,
        skillId,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  );
