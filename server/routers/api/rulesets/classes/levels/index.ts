import { toJson } from "@/server/errors/index.ts";
import type { SessionContext } from "@/server/middlewares/index.ts";
import { ClassLevelsService } from "@/server/services/rulesets/index.ts";
import { limit, page } from "@/server/routers/api/validation.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

export default new Hono<SessionContext>()
  .get(
    "/:id/classes/:classId/levels",
    zValidator("param", z.object({ id: z.string().uuid(), classId: z.string().uuid() })),
    async (c) => {
      const { id, classId } = c.req.valid("param");
      const classLevelsService = ClassLevelsService.initialize();
      const result = await classLevelsService.call(
        "getClassLevels",
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
  .get(
    "/:id/classes/:classId/levels/:levelId",
    zValidator(
      "param",
      z.object({ id: z.string().uuid(), classId: z.string().uuid(), levelId: z.string().uuid() }),
    ),
    async (c) => {
      const { id, classId, levelId } = c.req.valid("param");
      const classLevelsService = ClassLevelsService.initialize();
      const result = await classLevelsService.call(
        "getClassLevel",
        id,
        classId,
        levelId,
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
    "/:id/class_levels/:classLevelId",
    zValidator("param", z.object({ id: z.string().uuid(), classLevelId: z.string().uuid() })),
    async (c) => {
      const { id, classLevelId } = c.req.valid("param");
      const classLevelsService = ClassLevelsService.initialize();
      const result = await classLevelsService.call(
        "getClassLevelById",
        id,
        classLevelId,
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
    "/:id/classes/:classId/spells",
    zValidator("param", z.object({ id: z.string().uuid(), classId: z.string().uuid() })),
    async (c) => {
      const { id, classId } = c.req.valid("param");
      const classLevelsService = ClassLevelsService.initialize();
      const result = await classLevelsService.call(
        "getClassLevelSpells",
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
  .get(
    "/:id/classes/:classId/spells-known",
    zValidator("param", z.object({ id: z.string().uuid(), classId: z.string().uuid() })),
    async (c) => {
      const { id, classId } = c.req.valid("param");
      const classLevelsService = ClassLevelsService.initialize();
      const result = await classLevelsService.call(
        "getClassLevelSpellsKnown",
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
  .get(
    "/:id/classes/:classId/feat-pools",
    zValidator("param", z.object({ id: z.string().uuid(), classId: z.string().uuid() })),
    async (c) => {
      const { id, classId } = c.req.valid("param");
      const classLevelsService = ClassLevelsService.initialize();
      const result = await classLevelsService.call(
        "getClassLevelFeatPools",
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
      const classLevelsService = ClassLevelsService.initialize();
      const result = await classLevelsService.call(
        "getClassSpellList",
        id,
        classId,
        { level, search },
        { limit, page },
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
    "/:id/classes/:classId/levels",
    zValidator("param", z.object({ id: z.string().uuid(), classId: z.string().uuid() })),
    zValidator(
      "json",
      z.object({
        level: z.number().int().min(1).max(20),
        bab: z.number().int().min(0),
        skills: z.number().int().min(1),
        saves: z.array(z.object({
          saveId: z.string().uuid(),
          base: z.number().int().min(0).max(12),
        })).optional(),
        feats: z.array(z.object({
          featId: z.string().uuid(),
          aptitudeId: z.string().uuid(),
          free: z.boolean().optional(),
        })).optional(),
      }),
    ),
    async (c) => {
      const { id, classId } = c.req.valid("param");
      const body = c.req.valid("json");
      const classLevelsService = ClassLevelsService.initialize();
      const result = await classLevelsService.call(
        "createClassLevel",
        c.var.requestSession,
        id,
        classId,
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
  .put(
    "/:id/classes/:classId/levels/:levelId",
    zValidator(
      "param",
      z.object({ id: z.string().uuid(), classId: z.string().uuid(), levelId: z.string().uuid() }),
    ),
    zValidator(
      "json",
      z.object({
        bab: z.number().int().min(0).optional(),
        skills: z.number().int().min(1).optional(),
        saves: z.array(z.object({
          saveId: z.string().uuid(),
          base: z.number().int().min(0).max(12),
        })).optional(),
        feats: z.array(z.object({
          featId: z.string().uuid(),
          aptitudeId: z.string().uuid(),
          free: z.boolean().optional(),
        })).optional(),
      }),
    ),
    async (c) => {
      const { id, classId, levelId } = c.req.valid("param");
      const body = c.req.valid("json");
      const classLevelsService = ClassLevelsService.initialize();
      const result = await classLevelsService.call(
        "updateClassLevel",
        c.var.requestSession,
        id,
        classId,
        levelId,
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
    "/:id/classes/:classId/levels/:levelId",
    zValidator(
      "param",
      z.object({ id: z.string().uuid(), classId: z.string().uuid(), levelId: z.string().uuid() }),
    ),
    async (c) => {
      const { id, classId, levelId } = c.req.valid("param");
      const classLevelsService = ClassLevelsService.initialize();
      const result = await classLevelsService.call(
        "deleteClassLevel",
        c.var.requestSession,
        id,
        classId,
        levelId,
      );
      const success = result[0];

      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }

      return c.json(result[1], 200);
    },
  );
