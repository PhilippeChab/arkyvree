/**
 * The core rules' package: the Core Rulebook's generated book joined to the hand-written core content (`CORE`), which it
 * seeds into the core ruleset it creates.
 */

import type { CoreContent, CorePackage } from "@/content/pf1/builders/rulesets/types.ts";
import { ANIMAL_COMPANIONS } from "@/content/pf1/data/bonds/animalCompanions.ts";
import { FAMILIARS } from "@/content/pf1/data/bonds/familiars.ts";
import { BONDED_MOUNTS } from "@/content/pf1/data/bonds/mounts.ts";
import { ABILITIES, LANGUAGES, SAVES, SKILLS } from "@/content/pf1/data/coreRules.ts";
import { buildCoreFeats } from "@/content/pf1/data/feats/coreFeats.ts";
import { WIZARD_SCHOOLS } from "@/content/pf1/data/wizardSchools.ts";
import { BOOK } from "@/content/pf1/generated/core-rulebook/index.ts";
import {
  ARMOR,
  EXOTIC_WEAPONS,
  GOODS,
  MAGIC_ARMOR,
  MAGIC_SHIELDS,
  MAGIC_WEAPONS,
  MARTIAL_WEAPONS,
  RINGS,
  RODS,
  SHIELDS,
  SIMPLE_WEAPONS,
  STAFFS,
  WONDROUS_ITEMS,
} from "@/content/pf1/generated/core-rulebook/items/index.ts";
import { ALL_RACES } from "@/content/pf1/generated/core-rulebook/races.ts";
import { PF1_RULESET_NAME } from "@/content/pf1/rulesetNames.ts";

/** The items others are made from: every weapon, armor and shield. A new ruleset starts with them. */
export const TEMPLATE_ITEMS = [...SIMPLE_WEAPONS, ...MARTIAL_WEAPONS, ...EXOTIC_WEAPONS, ...ARMOR, ...SHIELDS];

/**
 * All the core rules are seeded with: the Core Rulebook's book (`BOOK`) and its races and items, the hand-written
 * arcane schools, feats, rules and bonded creatures; its items the book's goods and magic items.
 */
export const CORE: CoreContent = {
  aptitudes: BOOK.aptitudes,
  languages: LANGUAGES,
  races: ALL_RACES,
  abilities: ABILITIES,
  skills: SKILLS,
  saves: SAVES,
  feats: [...BOOK.standaloneFeats, ...BOOK.classFeats, ...buildCoreFeats(WIZARD_SCHOOLS)],
  classes: BOOK.classes,
  templateItems: TEMPLATE_ITEMS,
  items: [
    ...GOODS,
    ...MAGIC_ARMOR,
    ...MAGIC_SHIELDS,
    ...MAGIC_WEAPONS,
    ...WONDROUS_ITEMS,
    ...RINGS,
    ...RODS,
    ...STAFFS,
  ],
  spells: BOOK.spells,
  wizardSchools: WIZARD_SCHOOLS,
  domains: BOOK.domains,
  bonds: [FAMILIARS, ANIMAL_COMPANIONS, BONDED_MOUNTS],
};

export const PF1_CORE_PACKAGE: CorePackage = {
  name: "pf1",
  type: "base_ruleset",
  seedsVersion: 1,
  ruleset: {
    name: PF1_RULESET_NAME,
    description:
      "The core rules of a fantasy role-playing game in which players build heroes from races and classes and advance them through adventures.",
  },
  content: CORE,
};
