/** What a 3.5 entity's body carries for the ruleset's rules, and the bounds they set on its columns. */

import { z } from "zod";

import { HIT_DIE_VALUES, MAX_CLASS_LEVEL, MAX_SAVE_BASE } from "@/shared/dnd3.5/classes.ts";
import { MAX_SPELL_LEVEL } from "@/shared/dnd3.5/spells.ts";

/** A class's hit die. */
const HIT_DIE = z.literal(HIT_DIE_VALUES, { error: () => `Hit die must be one of: ${HIT_DIE_VALUES.join(", ")}` });

/**
 * The fields of an entity's body the ruleset's rules take, as the shapes a route validates a body with, by entity:
 * a class's hit die, a class level's base attack and skill points, a spell's fields and a skill's.
 */
export const ENTITY_FIELDS = {
  klasses: { hd: HIT_DIE.optional() },
  klassLevels: { bab: z.number().int().min(0), skills: z.number().int().min(1) },
  powers: {
    school: z.string().optional(),
    subschool: z.string().optional(),
    descriptors: z.array(z.string()).optional(),
    castingTime: z.string().optional(),
    rangeType: z.string().optional(),
    target: z.string().optional(),
    areaOfEffect: z.string().optional(),
    duration: z.string().optional(),
    spellResistance: z.string().optional(),
    components: z.array(z.string()).optional(),
  },
  skills: {
    impactedByWeight: z.boolean(),
    checkPenaltyMultiplier: z.number().int().min(1),
    usableWithoutTraining: z.boolean(),
  },
};

/** The bounds the ruleset's rules set on its entities' columns: a class's last level, a save's base bonus, a spell's level. */
export const RULESET_LIMITS = { classLevel: MAX_CLASS_LEVEL, saveBase: MAX_SAVE_BASE, spellLevel: MAX_SPELL_LEVEL };
