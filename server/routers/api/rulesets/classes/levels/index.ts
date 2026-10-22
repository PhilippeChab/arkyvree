import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { classParams } from "@/server/routers/api/rulesets/classes/validation.ts";
import { entityFields, idParam } from "@/server/routers/api/validation.ts";
import { ClassLevelsService } from "@/server/services/rulesets/classes/levels/index.ts";

const classLevelParams = idParam.extend({ classLevelId: z.string().uuid() });

/**
 * A class level's body, its create's and its update's: its fields and when it was last read (an update's), and every
 * other key as it is, which its class's rules read (a new level's number, its saves' base bonuses, the feats it grants).
 */
const levelBody = z.looseObject({ fields: entityFields.optional(), updatedAt: z.string().optional() });

const levelParams = classParams.extend({ levelId: z.string().uuid() });

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
  .post("/:id/classes/:classId/levels", validate("param", classParams), validate("json", levelBody), async (c) => {
    const { id, classId } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(await ClassLevelsService.createClassLevel(c.var.requestSession, id, classId, body), 201);
  })
  .put(
    "/:id/classes/:classId/levels/:levelId",
    validate("param", levelParams),
    validate("json", levelBody),
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
