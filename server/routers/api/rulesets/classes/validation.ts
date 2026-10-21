import { z } from "zod";

import { idParam } from "@/server/routers/api/validation.ts";

/** A class route's `:id` (the ruleset) and `:classId` */
export const classParams = idParam.extend({ classId: z.string().uuid() });

/** A class level's granted feats, its create's, its update's and its progression's. */
export const levelFeats = z
  .array(z.object({ featId: z.string().uuid(), aptitudeId: z.string().uuid(), free: z.boolean().optional() }))
  .optional();

/** A class level's saves, each its base bonus: its create's, its update's and its progression's. */
export const levelSaves = z.array(z.object({ saveId: z.string().uuid(), base: z.number().int() })).optional();

/** A class's progression's pools: the picks each level gives in each of its pools. */
export const progressionPools = z
  .array(
    z.object({
      aptitudeId: z.string().uuid(),
      picks: z.array(z.object({ levelId: z.string().uuid(), count: z.number().int() })),
    }),
  )
  .optional()
  .meta({ description: "The picks each level gives in each of its pools" });

/**
 * A class's progression's spell tables' totals: each level's, by spell level from 0, `null` for none (its rules check
 * their bounds); the spells it knows `all` of a level's.
 */
export const progressionSpells = z
  .object({
    known: z
      .array(
        z.object({
          levelId: z.string().uuid(),
          counts: z.array(z.union([z.number().int(), z.literal("all")]).nullable()),
        }),
      )
      .optional()
      .meta({ description: "Each level's spells known by spell level, from 0: `all`, or none (null)" }),
    perDay: z
      .array(z.object({ levelId: z.string().uuid(), counts: z.array(z.number().int().nullable()) }))
      .optional()
      .meta({ description: "Each level's spells a day by spell level, from 0: none (null)" }),
  })
  .optional();
