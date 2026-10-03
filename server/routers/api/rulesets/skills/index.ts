import { Hono } from "hono";
import { z } from "zod";

import { zValidator } from "@/server/middlewares/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { respond } from "@/server/routers/respond.ts";
import { SkillsService } from "@/server/services/rulesets/index.ts";

export default new Hono<SessionContext>()
  .get(
    "/:id/skills",
    zValidator("param", idParam),
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
      const result = await skillsService.call(
        "getRulesetSkills",
        id,
        { search, childOnly, orderBy, orderDir },
        { limit, page },
      );
      return respond(c, result, 200);
    },
  )
  .get(
    "/:id/skills/:skillId",
    zValidator("param", z.object({ id: z.string().uuid(), skillId: z.string().uuid() })),
    async (c) => {
      const { id, skillId } = c.req.valid("param");

      const skillsService = SkillsService.initialize();
      const result = await skillsService.call("getRulesetSkill", id, skillId);
      return respond(c, result, 200);
    },
  )
  .post(
    "/:id/skills",
    zValidator("param", idParam),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z
          .string()
          .optional()
          .transform((v) => v || null),
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
      return respond(c, result, 200);
    },
  )
  .put(
    "/:id/skills/:skillId",
    zValidator("param", z.object({ id: z.string().uuid(), skillId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        name: z.string().min(1),
        description: z
          .string()
          .optional()
          .transform((v) => v || null),
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
      const result = await skillsService.call("updateRulesetSkill", c.var.requestSession, id, skillId, body);
      return respond(c, result, 200);
    },
  )
  .delete(
    "/:id/skills/:skillId",
    zValidator("param", z.object({ id: z.string().uuid(), skillId: z.string().uuid() })),
    async (c) => {
      const { id, skillId } = c.req.valid("param");

      const skillsService = SkillsService.initialize();
      const result = await skillsService.call("deleteRulesetSkill", c.var.requestSession, id, skillId);
      return respond(c, result, 200);
    },
  );
