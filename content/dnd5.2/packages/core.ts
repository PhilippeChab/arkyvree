/**
 * The core rules' package: the SRD 5.2.1's generated book joined to the hand-written core content (`CORE`), which it
 * seeds into the core ruleset it creates.
 */

import type { CoreContent, CorePackage } from "@/content/dnd5.2/builders/rulesets/types.ts";
import { ABILITIES, LANGUAGES, SAVES, SKILLS } from "@/content/dnd5.2/data/coreRules.ts";
import { buildCoreFeats } from "@/content/dnd5.2/data/feats/coreFeats.ts";
import { BOOK } from "@/content/dnd5.2/generated/srd/index.ts";
import {
  ARMOR,
  GEAR,
  MAGIC_AMMUNITION,
  MAGIC_ARMOR,
  MAGIC_SHIELDS,
  MAGIC_WEAPONS,
  MARTIAL_WEAPONS,
  POTIONS,
  RINGS,
  SHIELDS,
  SIMPLE_WEAPONS,
  STAFFS,
  TOOLS,
  WANDS,
  WONDROUS_ITEMS,
} from "@/content/dnd5.2/generated/srd/items/index.ts";
import { DND52_RULESET_NAME } from "@/content/dnd5.2/rulesetNames.ts";

/** The items others are made from: every weapon, armor and the Shield. A new ruleset starts with them. */
export const TEMPLATE_ITEMS = [...SIMPLE_WEAPONS, ...MARTIAL_WEAPONS, ...ARMOR, ...SHIELDS];

/**
 * All the core rules are seeded with: the SRD's book (`BOOK`: its classes, feats, spells, species and backgrounds) and
 * its items, the hand-written abilities, saves, skills and languages, and the proficiencies' and weapon masteries'
 * feats; its items the book's gear, tools and magic items.
 */
export const CORE: CoreContent = {
  aptitudes: BOOK.aptitudes,
  languages: LANGUAGES,
  species: BOOK.species,
  backgrounds: BOOK.backgrounds,
  abilities: ABILITIES,
  skills: SKILLS,
  saves: SAVES,
  feats: [...BOOK.standaloneFeats, ...BOOK.classFeats, ...buildCoreFeats()],
  classes: BOOK.classes,
  templateItems: TEMPLATE_ITEMS,
  items: [
    ...GEAR,
    ...TOOLS,
    ...MAGIC_AMMUNITION,
    ...MAGIC_ARMOR,
    ...MAGIC_SHIELDS,
    ...MAGIC_WEAPONS,
    ...POTIONS,
    ...RINGS,
    ...STAFFS,
    ...WANDS,
    ...WONDROUS_ITEMS,
  ],
  spells: BOOK.spells,
};

export const DND52_CORE_PACKAGE: CorePackage = {
  name: "dnd52",
  type: "base_ruleset",
  seedsVersion: 1,
  ruleset: {
    name: DND52_RULESET_NAME,
    description:
      "The core rules of a fantasy role-playing game in which players build heroes from species, backgrounds and classes and advance them through adventures.",
  },
  content: CORE,
};
