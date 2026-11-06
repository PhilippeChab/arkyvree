/**
 * What a family of feats is taken for (a weapon feat's weapons, a spell school feat's schools, Skill Focus's skills, an
 * element), and how its feats' texts name the option taken.
 */

import { stripSeparators } from "@/shared/text.ts";
import { SKILLS_WITH_CHECKS } from "@/vocabulary/pf1/skills.ts";
import { MAGIC_SCHOOLS } from "@/vocabulary/pf1/spells.ts";
import { ALL_WEAPONS, CROSSBOW_WEAPONS } from "@/vocabulary/pf1/weapons.ts";

/**
 * A family's options: their kind, their names, and the list the generated code makes its feats over, by the name it
 * imports (`ALL_WEAPONS`), or written out when no module lists it (`inline`).
 */
export interface FamilyOptions {
  inline?: true;
  kind: OptionKind;
  list: string;
  names: readonly string[];
}

/** The kind of option a family's feats are taken for. */
export type OptionKind = "element" | "school" | "skill" | "weapon";

/** The elemental subtypes Elemental Channel is taken for. */
const ELEMENTS = ["Air", "Earth", "Fire", "Water"] as const;

/** The weapons' options: every weapon, by the list the generated code imports. */
const WEAPONS: FamilyOptions = { kind: "weapon", list: "ALL_WEAPONS", names: ALL_WEAPONS };

/**
 * Each family of feats taken for an option the generator makes, by its name (each in `FEAT_FAMILIES`). The weapon
 * proficiencies' feats, one per weapon, are written by hand (`content/pf1/data/feats/`): no family here.
 */
export const FAMILY_OPTIONS: Readonly<Record<string, FamilyOptions>> = {
  "Elemental Channel": { kind: "element", list: JSON.stringify(ELEMENTS), names: ELEMENTS, inline: true },
  "Greater Spell Focus": { kind: "school", list: "MAGIC_SCHOOLS", names: MAGIC_SCHOOLS },
  "Greater Weapon Focus": WEAPONS,
  "Greater Weapon Specialization": WEAPONS,
  "Improved Critical": WEAPONS,
  "Rapid Reload": { kind: "weapon", list: "CROSSBOW_WEAPONS", names: CROSSBOW_WEAPONS },
  "Skill Focus": { kind: "skill", list: "SKILLS_WITH_CHECKS", names: SKILLS_WITH_CHECKS },
  "Spell Focus": { kind: "school", list: "MAGIC_SCHOOLS", names: MAGIC_SCHOOLS },
  "Weapon Focus": WEAPONS,
  "Weapon Specialization": WEAPONS,
};

/** The placeholder a family's description and paths name its option by, which its generated code fills per option. */
export const OPTION = "{option}";

/**
 * Where a family's feat's text names the option taken, which its description names the option at (`OPTION`): "the
 * chosen skill", "the school of magic you select", "your chosen elemental subtype". A weapon's keeps its words ("the
 * selected weapon"), a weapon's name being no word of a sentence.
 */
export const OPTION_MENTIONS: Readonly<Partial<Record<OptionKind, { pattern: RegExp; written: string }>>> = {
  element: { pattern: /\byour (?:chosen )?elemental subtype/g, written: "the {option} subtype" },
  school: { pattern: /\bthe school of magic you select/g, written: "the school of {option}" },
  skill: { pattern: /\bthe chosen skill/g, written: "{option}" },
};

/** The name an option takes among `names`, by its slug ("conjuration": Conjuration), if any. */
export function findOptionName(option: string, names: readonly string[]): string | undefined {
  return names.find((name) => stripSeparators(name) === stripSeparators(option));
}
