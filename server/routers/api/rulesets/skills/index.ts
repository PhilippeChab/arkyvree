import { Hono } from "hono";
import { z } from "zod";

import { zValidator } from "@/server/middlewares/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { SkillsService } from "@/server/services/rulesets/skills/index.ts";

const skillParams = idParam.extend({ skillId: z.string().uuid() });

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
      return c.json(await SkillsService.getSkills(id, { search, childOnly, orderBy, orderDir }, { limit, page }), 200);
    },
  )
  .get("/:id/skills/:skillId", zValidator("param", skillParams), async (c) => {
    const { id, skillId } = c.req.valid("param");
    return c.json(await SkillsService.getSkill(id, skillId), 200);
  })
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
        checkPenaltyMultiplier: z.number().int().min(1),
        usableWithoutTraining: z.boolean(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await SkillsService.createSkill(c.var.requestSession, id, body), 200);
    },
  )
  .put(
    "/:id/skills/:skillId",
    zValidator("param", skillParams),
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
        checkPenaltyMultiplier: z.number().int().min(1),
        usableWithoutTraining: z.boolean(),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, skillId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await SkillsService.updateSkill(c.var.requestSession, id, skillId, body), 200);
    },
  )
  .delete("/:id/skills/:skillId", zValidator("param", skillParams), async (c) => {
    const { id, skillId } = c.req.valid("param");
    return c.json(await SkillsService.deleteSkill(c.var.requestSession, id, skillId), 200);
  });
