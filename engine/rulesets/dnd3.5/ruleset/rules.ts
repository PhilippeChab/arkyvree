import type { RulesDescription } from "@/engine/core/module/index.ts";
import { BONDED_KINDS } from "@/vocabulary/dnd3.5/bondedKinds.ts";
import { MAX_CLASS_LEVEL } from "@/vocabulary/dnd3.5/classes.ts";
import { SPELL_LEVEL_LABELS, SPELL_LEVELS } from "@/vocabulary/dnd3.5/spells.ts";

/**
 * What every 3.5 ruleset shares: its powers are spells, a race or a class is for a player character or a creature
 * bonded to one, a class has 20 levels and a spell 0 to 9, and its system rulesets' SRD content is Open Game Content.
 */
export const RULES: RulesDescription = {
  entityKinds: [
    { label: "Player Character", value: "pc" },
    ...BONDED_KINDS.map((kind) => ({ label: kind.label, value: kind.slug })),
  ],
  lastClassLevel: MAX_CLASS_LEVEL,
  license: {
    notice:
      "This notice applies to the SRD-derived Open Game Content in this system source package. It does not license the application code or designate independent user-created content as Open Game Content.",
    text: "ogl",
  },
  powerLevels: SPELL_LEVELS.map((level) => ({ label: SPELL_LEVEL_LABELS[level], level })),
  words: { powers: { many: "Spells", one: "Spell" } },
};
