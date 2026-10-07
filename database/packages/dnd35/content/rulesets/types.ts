import type { AbilitySeed } from "@/database/packages/dnd35/content/abilities/types.ts";
import type { BondContent } from "@/database/packages/dnd35/content/bonds/types.ts";
import type { ClassSeed } from "@/database/packages/dnd35/content/classes/types.ts";
import type { DomainSeed } from "@/database/packages/dnd35/content/domains/types.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import type { ItemSeed } from "@/database/packages/dnd35/content/items/types.ts";
import type { LanguageSeed } from "@/database/packages/dnd35/content/languages/types.ts";
import type { RaceSeed } from "@/database/packages/dnd35/content/races/types.ts";
import type { SaveSeed } from "@/database/packages/dnd35/content/saves/types.ts";
import type { SkillSeed } from "@/database/packages/dnd35/content/skills/types.ts";
import type { SpellSeed } from "@/database/packages/dnd35/content/spells/types.ts";
import type { WizardSchoolSeed } from "@/database/packages/dnd35/content/wizardSchools/types.ts";

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
