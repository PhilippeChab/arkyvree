/** The bounds the Pathfinder rules set on its entities' and characters' values. */

import { MAX_ABILITY_SCORE } from "@/vocabulary/pf1/abilities.ts";
import { MAX_CHARACTER_LEVEL, MAX_CLASS_LEVEL, MAX_SAVE_BASE, MAX_TABLE_COUNT } from "@/vocabulary/pf1/classes.ts";
import { MAX_ITEM_VARIANTS } from "@/vocabulary/pf1/itemTemplates.ts";
import { MAX_SPELL_LEVEL } from "@/vocabulary/pf1/spells.ts";

/**
 * The bounds the ruleset's rules set on its entities' and characters' values, which its operations check: an ability's
 * score, a character's last level, a class's last level, the variants an item's form makes at once, a save's base
 * bonus, a spell's level, a count of a class's table.
 */
export const RULESET_LIMITS = {
  abilityScore: MAX_ABILITY_SCORE,
  characterLevel: MAX_CHARACTER_LEVEL,
  classLevel: MAX_CLASS_LEVEL,
  itemVariants: MAX_ITEM_VARIANTS,
  saveBase: MAX_SAVE_BASE,
  spellLevel: MAX_SPELL_LEVEL,
  tableCount: MAX_TABLE_COUNT,
};
