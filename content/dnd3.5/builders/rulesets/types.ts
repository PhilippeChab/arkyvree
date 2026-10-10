import type { CorePackageDefinition, ExtensionPackageDefinition } from "@/content/core/builders/packages/types.ts";
import type { AbilitySeed } from "@/content/dnd3.5/builders/abilities/types.ts";
import type { BondContent } from "@/content/dnd3.5/builders/bonds/types.ts";
import type { ClassSeed } from "@/content/dnd3.5/builders/classes/types.ts";
import type { DomainSeed } from "@/content/dnd3.5/builders/domains/types.ts";
import type { FeatSeed } from "@/content/dnd3.5/builders/feats/types.ts";
import type { ItemSeed } from "@/content/dnd3.5/builders/items/types.ts";
import type { LanguageSeed } from "@/content/dnd3.5/builders/languages/types.ts";
import type { RaceSeed } from "@/content/dnd3.5/builders/races/types.ts";
import type { SaveSeed } from "@/content/dnd3.5/builders/saves/types.ts";
import type { SkillSeed } from "@/content/dnd3.5/builders/skills/types.ts";
import type { SpellSeed } from "@/content/dnd3.5/builders/spells/types.ts";
import type { WizardSchoolSeed } from "@/content/dnd3.5/builders/wizardSchools/types.ts";

/** An extension's book, as the parser generates it (`generated/<book>/index.ts`). */
export type BookContent = {
  aptitudes: string[];
  classes: ClassSeed[];
  classFeats: FeatSeed[];
  /** Core feats the book changes. */
  cowFeats: CowFeatEntry[];
  /** Core spells the book adds to its spell lists. */
  cowSpells: CowSpellEntry[];
  domains: DomainSeed[];
  spells: SpellSeed[];
  standaloneFeats: FeatSeed[];
};

/**
 * The core rules' content: the SRD's, as the generator wrote it, and the hand-written core rules, template items and
 * bonded creatures.
 */
export type CoreContent = {
  abilities: AbilitySeed[];
  aptitudes: string[];
  bonds: BondContent[];
  classes: ClassSeed[];
  domains: DomainSeed[];
  feats: FeatSeed[];
  items: ItemSeed[];
  languages: LanguageSeed[];
  races: RaceSeed[];
  saves: SaveSeed[];
  skills: SkillSeed[];
  spells: SpellSeed[];
  /** The items others are made from, which a new ruleset starts with. */
  templateItems: ItemSeed[];
  wizardSchools: WizardSchoolSeed[];
};

/** The core rules' package: the base ruleset it creates, and the core rules' content it seeds. */
export type CorePackage = CorePackageDefinition<CoreContent>;

/** A core feat an extension changes: more aptitudes it's taken in, and the class levels that also qualify for it. */
export type CowFeatEntry = {
  aptitudes: string[];
  feat: string;
  requirements: { className: string; level: number }[];
};

/** A core spell an extension adds to its spell lists, each at its level there. */
export type CowSpellEntry = {
  aptitudes: { aptitude: string; level: number }[];
  spell: string;
};

/** An extension's package: the extension of the core rules it creates, and the book it seeds. */
export type ExtensionPackage = ExtensionPackageDefinition<BookContent>;
