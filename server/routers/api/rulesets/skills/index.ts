import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { entityBody, entityOrderBy, idParam, limit, orderDirAsc, page } from "@/server/routers/api/validation.ts";
import { SkillsService } from "@/server/services/rulesets/skills/index.ts";

/** A skill's body, its create's and its update's: an entity's (`entityBody`), whose columns its rules read. */
const skillBody = entityBody;

const skillParams = idParam.extend({ skillId: z.string().uuid() });

export default new Hono<SessionContext>()
  .get(
    "/:id/skills",
    validate("param", idParam),
    validate(
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
  .get("/:id/skills/:skillId", validate("param", skillParams), async (c) => {
    const { id, skillId } = c.req.valid("param");
    return c.json(await SkillsService.getSkill(id, skillId), 200);
  })
  .post("/:id/skills", validate("param", idParam), validate("json", skillBody), async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(await SkillsService.createSkill(c.var.requestSession, id, body), 200);
  })
  .put("/:id/skills/:skillId", validate("param", skillParams), validate("json", skillBody), async (c) => {
    const { id, skillId } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(await SkillsService.updateSkill(c.var.requestSession, id, skillId, body), 200);
  })
  .delete("/:id/skills/:skillId", validate("param", skillParams), async (c) => {
    const { id, skillId } = c.req.valid("param");
    return c.json(await SkillsService.deleteSkill(c.var.requestSession, id, skillId), 200);
  });
