/** The bounds the 3.5 rules set on its entities' and characters' columns. */

import { MAX_ABILITY_SCORE } from "@/shared/dnd3.5/abilities.ts";
import { MAX_CHARACTER_LEVEL, MAX_CLASS_LEVEL, MAX_SAVE_BASE } from "@/shared/dnd3.5/classes.ts";
import { MAX_SPELL_LEVEL } from "@/shared/dnd3.5/spells.ts";
import { MAX_ITEM_VARIANTS } from "@/shared/itemTemplates.ts";

/**
 * The bounds the ruleset's rules set on its entities' and characters' columns, which its operations check: an ability's
 * score, a character's last level, a class's last level, the variants an item's form makes at once, a save's base
 * bonus, a spell's level.
 */
export const RULESET_LIMITS = {
  abilityScore: MAX_ABILITY_SCORE,
  characterLevel: MAX_CHARACTER_LEVEL,
  classLevel: MAX_CLASS_LEVEL,
  itemVariants: MAX_ITEM_VARIANTS,
  saveBase: MAX_SAVE_BASE,
  spellLevel: MAX_SPELL_LEVEL,
};
