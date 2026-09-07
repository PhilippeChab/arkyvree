import { toJson } from "@/server/errors/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { ClassSkillsService } from "@/server/services/rulesets/index.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

export default new Hono<SessionContext>()
  .get(
    "/:id/classes/:classId/skills",
    zValidator("param", z.object({ id: z.string().uuid(), classId: z.string().uuid() })),
    async (c) => {
      const { id, classId } = c.req.valid("param");
      const classSkillsService = ClassSkillsService.initialize();
      const result = await classSkillsService.call(
        "getClassSkills",
        id,
        classId,
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
    "/:id/classes/:classId/skills",
    zValidator("param", z.object({ id: z.string().uuid(), classId: z.string().uuid() })),
    zValidator("json", z.object({ skillId: z.string().uuid() })),
    async (c) => {
      const { id, classId } = c.req.valid("param");
      const { skillId } = c.req.valid("json");
      const classSkillsService = ClassSkillsService.initialize();
      const result = await classSkillsService.call(
        "addClassSkill",
        c.var.requestSession,
        id,
        classId,
        skillId,
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
      const result = await classSkillsService.call(
        "removeClassSkill",
        c.var.requestSession,
        id,
        classId,
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
