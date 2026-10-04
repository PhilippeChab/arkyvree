import { Hono } from "hono";
import { z } from "zod";

import { zValidator } from "@/server/middlewares/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { limit, page } from "@/server/routers/api/validation.ts";
import { ClassLevelsService } from "@/server/services/rulesets/classes/levels/index.ts";

export default new Hono<SessionContext>()
  .get(
    "/:id/class-levels/:classLevelId",
    zValidator("param", z.object({ id: z.string().uuid(), classLevelId: z.string().uuid() })),
    async (c) => {
      const { id, classLevelId } = c.req.valid("param");
      return c.json(await ClassLevelsService.getClassLevelWithClassName(id, classLevelId), 200);
    },
  )
  .get(
    "/:id/classes/:classId/feat-pools",
    zValidator("param", z.object({ id: z.string().uuid(), classId: z.string().uuid() })),
    async (c) => {
      const { id, classId } = c.req.valid("param");
      return c.json(await ClassLevelsService.getClassLevelFeatPools(id, classId), 200);
    },
  )
  .get(
    "/:id/classes/:classId/levels",
    zValidator("param", z.object({ id: z.string().uuid(), classId: z.string().uuid() })),
    async (c) => {
      const { id, classId } = c.req.valid("param");
      return c.json(await ClassLevelsService.getClassLevels(id, classId), 200);
    },
  )
  .get(
    "/:id/classes/:classId/levels/:levelId",
    zValidator("param", z.object({ id: z.string().uuid(), classId: z.string().uuid(), levelId: z.string().uuid() })),
    async (c) => {
      const { id, classId, levelId } = c.req.valid("param");
      return c.json(await ClassLevelsService.getClassLevel(id, classId, levelId), 200);
    },
  )
  .get(
    "/:id/classes/:classId/spell-list",
    zValidator("param", z.object({ id: z.string().uuid(), classId: z.string().uuid() })),
    zValidator(
      "query",
      z.object({
        limit,
        page,
        level: z.coerce.number().min(0).max(9).optional(),
        search: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, classId } = c.req.valid("param");
      const { limit, page, level, search } = c.req.valid("query");
      return c.json(await ClassLevelsService.getClassSpellList(id, classId, { level, search }, { limit, page }), 200);
    },
  )
  .get(
    "/:id/classes/:classId/spells",
    zValidator("param", z.object({ id: z.string().uuid(), classId: z.string().uuid() })),
    async (c) => {
      const { id, classId } = c.req.valid("param");
      return c.json(await ClassLevelsService.getClassLevelSpells(id, classId), 200);
    },
  )
  .get(
    "/:id/classes/:classId/spells-known",
    zValidator("param", z.object({ id: z.string().uuid(), classId: z.string().uuid() })),
    async (c) => {
      const { id, classId } = c.req.valid("param");
      return c.json(await ClassLevelsService.getClassLevelSpellsKnown(id, classId), 200);
    },
  )
  .post(
    "/:id/classes/:classId/levels",
    zValidator("param", z.object({ id: z.string().uuid(), classId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        level: z.number().int().min(1).max(20),
        bab: z.number().int().min(0),
        skills: z.number().int().min(1),
        saves: z
          .array(
            z.object({
              saveId: z.string().uuid(),
              base: z.number().int().min(0).max(12),
            }),
          )
          .optional(),
        feats: z
          .array(
            z.object({
              featId: z.string().uuid(),
              aptitudeId: z.string().uuid(),
              free: z.boolean().optional(),
            }),
          )
          .optional(),
      }),
    ),
    async (c) => {
      const { id, classId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await ClassLevelsService.createClassLevel(c.var.requestSession, id, classId, body), 201);
    },
  )
  .put(
    "/:id/classes/:classId/levels/:levelId",
    zValidator("param", z.object({ id: z.string().uuid(), classId: z.string().uuid(), levelId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        bab: z.number().int().min(0).optional(),
        skills: z.number().int().min(1).optional(),
        saves: z
          .array(
            z.object({
              saveId: z.string().uuid(),
              base: z.number().int().min(0).max(12),
            }),
          )
          .optional(),
        feats: z
          .array(
            z.object({
              featId: z.string().uuid(),
              aptitudeId: z.string().uuid(),
              free: z.boolean().optional(),
            }),
          )
          .optional(),
      }),
    ),
    async (c) => {
      const { id, classId, levelId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await ClassLevelsService.updateClassLevel(c.var.requestSession, id, classId, levelId, body), 200);
    },
  )
  .delete(
    "/:id/classes/:classId/levels/:levelId",
    zValidator("param", z.object({ id: z.string().uuid(), classId: z.string().uuid(), levelId: z.string().uuid() })),
    async (c) => {
      const { id, classId, levelId } = c.req.valid("param");
      return c.json(await ClassLevelsService.deleteClassLevel(c.var.requestSession, id, classId, levelId), 200);
    },
  );
