import { Hono } from "hono";
import { z } from "zod";

import type { ClassEngine } from "@/engine/index.ts";
import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { classParams } from "@/server/routers/api/rulesets/classes/validation.ts";
import { buildEntityFieldsSchema } from "@/server/routers/api/schemaBuilders.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { ClassLevelsService } from "@/server/services/rulesets/classes/levels/index.ts";

/** A class level's fields, its create's and its update's: its ruleset's rules read them. */
const classLevelFields = buildEntityFieldsSchema<ClassEngine["planLevelCreate"]>();

const classLevelParams = idParam.extend({ classLevelId: z.string().uuid() });
const levelFeats = z
  .array(z.object({ featId: z.string().uuid(), aptitudeId: z.string().uuid(), free: z.boolean().optional() }))
  .optional();

const levelParams = classParams.extend({ levelId: z.string().uuid() });
/** A class level's saves (each its base bonus) and granted feats, its create's and its update's. */
const levelSaves = z.array(z.object({ saveId: z.string().uuid(), base: z.number().int() })).optional();

export default new Hono<SessionContext>()
  .get("/:id/class-levels/:classLevelId", validate("param", classLevelParams), async (c) => {
    const { id, classLevelId } = c.req.valid("param");
    return c.json(await ClassLevelsService.getClassLevelWithClassName(id, classLevelId), 200);
  })
  .get("/:id/classes/:classId/feat-pools", validate("param", classParams), async (c) => {
    const { id, classId } = c.req.valid("param");
    return c.json(await ClassLevelsService.getClassLevelFeatPools(id, classId), 200);
  })
  .get("/:id/classes/:classId/levels", validate("param", classParams), async (c) => {
    const { id, classId } = c.req.valid("param");
    return c.json(await ClassLevelsService.getClassLevels(id, classId), 200);
  })
  .get("/:id/classes/:classId/levels/:levelId", validate("param", levelParams), async (c) => {
    const { id, classId, levelId } = c.req.valid("param");
    return c.json(await ClassLevelsService.getClassLevel(id, classId, levelId), 200);
  })
  .get("/:id/classes/:classId/spell-lists", validate("param", classParams), async (c) => {
    const { id, classId } = c.req.valid("param");
    return c.json(await ClassLevelsService.getClassSpellLists(id, classId), 200);
  })
  .get("/:id/classes/:classId/spells", validate("param", classParams), async (c) => {
    const { id, classId } = c.req.valid("param");
    return c.json(await ClassLevelsService.getClassLevelSpells(id, classId), 200);
  })
  .get("/:id/classes/:classId/spells-known", validate("param", classParams), async (c) => {
    const { id, classId } = c.req.valid("param");
    return c.json(await ClassLevelsService.getClassLevelSpellsKnown(id, classId), 200);
  })
  .post(
    "/:id/classes/:classId/levels",
    validate("param", classParams),
    validate(
      "json",
      z.object({
        level: z.number().int(),
        fields: classLevelFields,
        saves: levelSaves,
        feats: levelFeats,
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
    validate("param", levelParams),
    validate(
      "json",
      z.object({
        fields: classLevelFields.optional(),
        saves: levelSaves,
        feats: levelFeats,
      }),
    ),
    async (c) => {
      const { id, classId, levelId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await ClassLevelsService.updateClassLevel(c.var.requestSession, id, classId, levelId, body), 200);
    },
  )
  .delete("/:id/classes/:classId/levels/:levelId", validate("param", levelParams), async (c) => {
    const { id, classId, levelId } = c.req.valid("param");
    return c.json(await ClassLevelsService.deleteClassLevel(c.var.requestSession, id, classId, levelId), 200);
  });
