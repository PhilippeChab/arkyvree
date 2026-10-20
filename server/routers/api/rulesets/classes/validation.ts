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
