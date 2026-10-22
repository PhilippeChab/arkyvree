import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import {
  classParams,
  levelFeats,
  levelSaves,
  progressionPools,
  progressionSpells,
} from "@/server/routers/api/rulesets/classes/validation.ts";
import { entityFields } from "@/server/routers/api/validation.ts";
import { ClassProgressionService } from "@/server/services/rulesets/classes/progression/index.ts";

export default new Hono<SessionContext>()
  .get("/:id/classes/:classId/progression", validate("param", classParams), async (c) => {
    const { id, classId } = c.req.valid("param");
    return c.json(await ClassProgressionService.getProgression(id, classId), 200);
  })
  .put(
    "/:id/classes/:classId/progression",
    validate("param", classParams),
    // A class's progression's save: its levels' forms, its pools' picks by level, and its spell tables' totals
    validate(
      "json",
      z.object({
        levels: z
          .array(
            z.object({
              levelId: z.string().uuid(),
              fields: entityFields.optional(),
              saves: levelSaves,
              feats: levelFeats,
            }),
          )
          .optional(),
        pools: progressionPools,
        spells: progressionSpells,
        levelTokens: z.array(z.object({ levelId: z.string().uuid(), updatedAt: z.string() })).optional(),
      }),
    ),
    async (c) => {
      const { id, classId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await ClassProgressionService.updateProgression(c.var.requestSession, id, classId, body), 200);
    },
  );
