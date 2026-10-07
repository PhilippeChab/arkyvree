import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { classParams } from "@/server/routers/api/rulesets/classes/validation.ts";
import { ClassSkillsService } from "@/server/services/rulesets/classes/skills/index.ts";

const skillParams = classParams.extend({ skillId: z.string().uuid() });

export default new Hono<SessionContext>()
  .get("/:id/classes/:classId/skills", validate("param", classParams), async (c) => {
    const { id, classId } = c.req.valid("param");
    return c.json(await ClassSkillsService.getClassSkills(id, classId), 200);
  })
  .post(
    "/:id/classes/:classId/skills",
    validate("param", classParams),
    validate("json", z.object({ skillId: z.string().uuid() })),
    async (c) => {
      const { id, classId } = c.req.valid("param");
      const { skillId } = c.req.valid("json");
      return c.json(await ClassSkillsService.addClassSkill(c.var.requestSession, id, classId, skillId), 200);
    },
  )
  .delete("/:id/classes/:classId/skills/:skillId", validate("param", skillParams), async (c) => {
    const { id, classId, skillId } = c.req.valid("param");
    return c.json(await ClassSkillsService.removeClassSkill(c.var.requestSession, id, classId, skillId), 200);
  });
