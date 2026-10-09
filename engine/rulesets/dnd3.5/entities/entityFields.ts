/** What a 3.5 entity's body carries for the ruleset's rules, and the bounds they set on its columns. */

import { z } from "zod";

import { MAX_ABILITY_SCORE } from "@/shared/dnd3.5/abilities.ts";
import { HIT_DIE_VALUES, MAX_CHARACTER_LEVEL, MAX_CLASS_LEVEL, MAX_SAVE_BASE } from "@/shared/dnd3.5/classes.ts";
import { MAX_SPELL_LEVEL } from "@/shared/dnd3.5/spells.ts";
import { MAX_ITEM_VARIANTS } from "@/shared/itemTemplates.ts";

import { CLASS_LEVEL_FIELDS } from "./classes/fields.ts";
import { POWER_FIELDS } from "./powers/fields.ts";
import { SKILL_FIELDS } from "./skills/fields.ts";

/** A class's hit die. */
const HIT_DIE = z.literal(HIT_DIE_VALUES, { error: () => `Hit die must be one of: ${HIT_DIE_VALUES.join(", ")}` });

/**
 * The fields of an entity's body the ruleset's rules take, as the shapes a route validates a body with, by entity:
 * a class's hit die (a column), and a class level's, a spell's and a skill's fields, as their codecs read them.
 */
export const ENTITY_FIELDS = {
  klasses: { hd: HIT_DIE.optional() },
  klassLevels: CLASS_LEVEL_FIELDS.shape(),
  powers: POWER_FIELDS.shape({ optional: true }),
  skills: SKILL_FIELDS.shape(),
};

/**
 * The bounds the ruleset's rules set on its entities' and characters' columns: an ability's score, a character's last
 * level, a class's last level, the variants an item's form makes at once, a save's base bonus, a spell's level.
 */
export const RULESET_LIMITS = {
  abilityScore: MAX_ABILITY_SCORE,
  characterLevel: MAX_CHARACTER_LEVEL,
  classLevel: MAX_CLASS_LEVEL,
  itemVariants: MAX_ITEM_VARIANTS,
  saveBase: MAX_SAVE_BASE,
  spellLevel: MAX_SPELL_LEVEL,
};
