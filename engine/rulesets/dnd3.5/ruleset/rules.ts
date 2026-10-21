import type { RulesDescription } from "@/engine/core/module/index.ts";
import { CLASS_COLUMNS, CLASS_LEVEL_COLUMNS, CLASS_LIST } from "@/engine/rulesets/dnd3.5/entities/classes/columns.ts";
import { ITEM_COLUMNS, ITEM_LIST } from "@/engine/rulesets/dnd3.5/entities/items/columns.ts";
import { POWER_COLUMNS, POWER_LIST } from "@/engine/rulesets/dnd3.5/entities/powers/columns.ts";
import { RACE_COLUMNS, RACE_LIST } from "@/engine/rulesets/dnd3.5/entities/races/columns.ts";
import { SKILL_COLUMNS, SKILL_LIST } from "@/engine/rulesets/dnd3.5/entities/skills/columns.ts";
import { BONDED_KINDS } from "@/vocabulary/dnd3.5/bondedKinds.ts";
import { MAX_CLASS_LEVEL } from "@/vocabulary/dnd3.5/classes.ts";
import { MAX_ITEM_VARIANTS } from "@/vocabulary/dnd3.5/itemTemplates.ts";
import { SPELL_LEVEL_LABELS, SPELL_LEVELS } from "@/vocabulary/dnd3.5/spells.ts";

/**
 * What every 3.5 ruleset shares: its entities' columns (a class's hit die, an item's slot…), its powers are spells, a race or a class is for a player character or a creature
 * bonded to one, a class has 20 levels and a spell 0 to 9, and its system rulesets' SRD content is Open Game Content.
 */
export const RULES: RulesDescription = {
  columns: {
    items: ITEM_COLUMNS,
    klass_levels: CLASS_LEVEL_COLUMNS,
    klasses: CLASS_COLUMNS,
    powers: POWER_COLUMNS,
    races: RACE_COLUMNS,
    skills: SKILL_COLUMNS,
  },
  entityKinds: [
    { label: "Player Character", value: "pc" },
    ...BONDED_KINDS.map((kind) => ({ label: kind.label, value: kind.slug })),
  ],
  lastClassLevel: MAX_CLASS_LEVEL,
  lists: { items: ITEM_LIST, klasses: CLASS_LIST, powers: POWER_LIST, races: RACE_LIST, skills: SKILL_LIST },
  maxItemVariants: MAX_ITEM_VARIANTS,
  license: {
    notice:
      "This notice applies to the SRD-derived Open Game Content in this system source package. It does not license the application code or designate independent user-created content as Open Game Content.",
    text: "ogl",
  },
  powerLevels: SPELL_LEVELS.map((level) => ({ label: SPELL_LEVEL_LABELS[level], level })),
  words: { powers: { many: "Spells", one: "Spell" } },
};
