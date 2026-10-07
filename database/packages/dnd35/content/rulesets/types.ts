import type { AbilityDefinition } from "@/database/packages/dnd35/content/abilities/types.ts";
import type { BondContent } from "@/database/packages/dnd35/content/bonds/types.ts";
import type { ClassSeed } from "@/database/packages/dnd35/content/classes/types.ts";
import type { DomainDefinition } from "@/database/packages/dnd35/content/domains/types.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import type { ItemDef } from "@/database/packages/dnd35/content/items/types.ts";
import type { LanguageDefinition } from "@/database/packages/dnd35/content/languages/types.ts";
import type { RaceDefinition } from "@/database/packages/dnd35/content/races/types.ts";
import type { SaveDefinition } from "@/database/packages/dnd35/content/saves/types.ts";
import type { SkillDefinition } from "@/database/packages/dnd35/content/skills/types.ts";
import type { SpellSeed } from "@/database/packages/dnd35/content/spells/types.ts";
import type { WizardSchoolDefinition } from "@/database/packages/dnd35/content/wizardSchools/types.ts";

/** An extension's book, as the parser generates it (`generated/<book>/index.ts`). */
export type BookContent = {
  aptitudes: string[];
  standaloneFeats: FeatSeed[];
  classFeats: FeatSeed[];
  /** Core feats the book changes. */
  cowFeats: CowFeatEntry[];
  spells: SpellSeed[];
  /** Core spells the book adds to its spell lists. */
  cowSpells: CowSpellEntry[];
  domains: DomainDefinition[];
  classes: ClassSeed[];
};

/**
 * The core rules' content: the SRD's, as the generator wrote it, and the hand-written core rules, template items and
 * bonded creatures, with the class level the cleric's and the wizard's spell levels open at.
 */
export type CoreContent = {
  aptitudes: string[];
  languages: LanguageDefinition[];
  races: RaceDefinition[];
  abilities: AbilityDefinition[];
  skills: SkillDefinition[];
  saves: SaveDefinition[];
  feats: FeatSeed[];
  classes: ClassSeed[];
  /** The items others are made from, which a new ruleset starts with. */
  templateItems: ItemDef[];
  items: ItemDef[];
  spells: SpellSeed[];
  wizardSchools: WizardSchoolDefinition[];
  domains: DomainDefinition[];
  bonds: BondContent[];
};

/** A core feat an extension changes: more aptitudes it's taken in, and the class levels that also qualify for it. */
export type CowFeatEntry = {
  feat: string;
  requirements: { className: string; level: number }[];
  aptitudes: string[];
};

/** A core spell an extension adds to its spell lists, each at its level there. */
export type CowSpellEntry = {
  spell: string;
  aptitudes: { aptitude: string; level: number }[];
};
