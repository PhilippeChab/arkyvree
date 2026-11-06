/** What a D&D 5th Edition package seeds: its core rules' content, a book's and its hand-written rows together. */

import type { CorePackageDefinition, ExtensionPackageDefinition } from "@/content/core/builders/packages/types.ts";
import type { AbilitySeed } from "@/content/dnd5.2/builders/abilities/types.ts";
import type { BackgroundSeed } from "@/content/dnd5.2/builders/backgrounds/types.ts";
import type { ClassSeed } from "@/content/dnd5.2/builders/classes/types.ts";
import type { FeatSeed } from "@/content/dnd5.2/builders/feats/types.ts";
import type { Dnd52ItemSeed } from "@/content/dnd5.2/builders/items/types.ts";
import type { LanguageSeed } from "@/content/dnd5.2/builders/languages/types.ts";
import type { SaveSeed } from "@/content/dnd5.2/builders/saves/types.ts";
import type { SkillSeed } from "@/content/dnd5.2/builders/skills/types.ts";
import type { SpeciesSeed } from "@/content/dnd5.2/builders/species/types.ts";
import type { LeveledSpellSeed } from "@/content/dnd5.2/builders/spells/types.ts";

/** A book's generated content: its pools, classes and their features, feats, spells, species and backgrounds. */
export interface BookContent {
  aptitudes: string[];
  backgrounds: BackgroundSeed[];
  classes: ClassSeed[];
  classFeats: FeatSeed[];
  species: SpeciesSeed[];
  spells: LeveledSpellSeed[];
  standaloneFeats: FeatSeed[];
}

/** The core rules' content: the SRD's book with the hand-written rules (abilities, saves, skills, languages, feats). */
export interface CoreContent {
  abilities: AbilitySeed[];
  aptitudes: string[];
  backgrounds: BackgroundSeed[];
  classes: ClassSeed[];
  feats: FeatSeed[];
  items: Dnd52ItemSeed[];
  languages: LanguageSeed[];
  saves: SaveSeed[];
  skills: SkillSeed[];
  species: SpeciesSeed[];
  spells: LeveledSpellSeed[];
  templateItems: Dnd52ItemSeed[];
}

export type CorePackage = CorePackageDefinition<CoreContent>;

export type ExtensionPackage = ExtensionPackageDefinition<BookContent>;
