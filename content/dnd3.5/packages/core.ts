/**
 * The core rules' package: the SRD's generated book joined to the hand-written core content (`CORE`), which it seeds into
 * the core ruleset it creates.
 */

import type { CoreContent, CorePackage } from "@/content/dnd3.5/builders/rulesets/types.ts";
import { ANIMAL_COMPANIONS } from "@/content/dnd3.5/data/bonds/animalCompanions.ts";
import { FAMILIARS } from "@/content/dnd3.5/data/bonds/familiars.ts";
import { SPECIAL_MOUNTS } from "@/content/dnd3.5/data/bonds/mounts.ts";
import { ABILITIES, LANGUAGES, SAVES, SKILLS } from "@/content/dnd3.5/data/coreRules.ts";
import { buildCoreFeats } from "@/content/dnd3.5/data/feats/coreFeats.ts";
import { BOOK } from "@/content/dnd3.5/generated/srd/index.ts";
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
} from "@/content/dnd3.5/generated/srd/items/index.ts";
import { ALL_RACES } from "@/content/dnd3.5/generated/srd/races.ts";
import { WIZARD_SCHOOLS } from "@/content/dnd3.5/generated/srd/wizardSchools.ts";
import { DND35_RULESET_NAME } from "@/content/dnd3.5/rulesetNames.ts";

/** The items others are made from: every weapon, armor and shield. A new ruleset starts with them. */
export const TEMPLATE_ITEMS = [...SIMPLE_WEAPONS, ...MARTIAL_WEAPONS, ...EXOTIC_WEAPONS, ...ARMOR, ...SHIELDS];

/**
 * All the core rules are seeded with: the SRD's book (`BOOK`) and its races, items and wizard schools, its hand-written
 * feats, rules and bonded creatures; its items the SRD's goods and magic items.
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
  bonds: [FAMILIARS, ANIMAL_COMPANIONS, SPECIAL_MOUNTS],
};

export const DND35_CORE_PACKAGE: CorePackage = {
  name: "dnd35",
  type: "base_ruleset",
  seedsVersion: 49,
  ruleset: {
    name: DND35_RULESET_NAME,
    description:
      "The 3.5 System Reference Document is a role-playing game system that allows players to create and control characters in a fantasy world.",
  },
  content: CORE,
};
