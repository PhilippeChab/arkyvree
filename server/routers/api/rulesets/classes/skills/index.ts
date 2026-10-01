import { Hono } from "hono";
import { z } from "zod";

import { zValidator } from "@/server/middlewares/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { respond } from "@/server/routers/respond.ts";
import { ClassSkillsService } from "@/server/services/rulesets/index.ts";

export default new Hono<SessionContext>()
  .get(
    "/:id/classes/:classId/skills",
    zValidator("param", z.object({ id: z.string().uuid(), classId: z.string().uuid() })),
    async (c) => {
      const { id, classId } = c.req.valid("param");
      const classSkillsService = ClassSkillsService.initialize();
      const result = await classSkillsService.call("getClassSkills", id, classId);
      return respond(c, result, 200);
    },
  )
  .post(
    "/:id/classes/:classId/skills",
    zValidator("param", z.object({ id: z.string().uuid(), classId: z.string().uuid() })),
    zValidator("json", z.object({ skillId: z.string().uuid() })),
    async (c) => {
      const { id, classId } = c.req.valid("param");
      const { skillId } = c.req.valid("json");
      const classSkillsService = ClassSkillsService.initialize();
      const result = await classSkillsService.call("addClassSkill", c.var.requestSession, id, classId, skillId);
      return respond(c, result, 200);
    },
  )
  .delete(
    "/:id/classes/:classId/skills/:skillId",
    zValidator(
      "param",
      z.object({
        id: z.string().uuid(),
        classId: z.string().uuid(),
        skillId: z.string().uuid(),
      }),
    ),
    async (c) => {
      const { id, classId, skillId } = c.req.valid("param");
      const classSkillsService = ClassSkillsService.initialize();
      const result = await classSkillsService.call("removeClassSkill", c.var.requestSession, id, classId, skillId);
      return respond(c, result, 200);
    },
  );
