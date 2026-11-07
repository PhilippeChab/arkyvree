import { readAbility } from "@/codegen/dnd5.2/tools/detect/proficiencies.ts";
import type { ClassReference } from "@/codegen/dnd5.2/tools/types/classes.ts";
import { classFeatures } from "@/content/dnd5.2/builders/aptitudes/names.ts";
import type { ClassSeed } from "@/content/dnd5.2/builders/classes/types.ts";
import type { FeatSeed } from "@/content/dnd5.2/builders/feats/types.ts";
import { CLASS_HD, CLASS_MULTICLASS_SLOTS } from "@/vocabulary/dnd5.2/fields/index.ts";

import { ClassEntries } from "./ClassEntries.ts";
import { ClassFeatureFeats } from "./ClassFeatureFeats.ts";
import { ClassProficiencies, type ToolPicks } from "./ClassProficiencies.ts";
import { ClassProgression } from "./ClassProgression.ts";

/**
 * A class reference's seeds: its class's seed (`seed`), the feats its features, subclasses and proficiencies are
 * (`feats`), and the tools its tool picks are among (`toolPicks`), read off its entries as its overrides correct them
 * (`ClassEntries`): its features' feats (`ClassFeatureFeats`), its proficiencies' (`ClassProficiencies`, among `tools`,
 * the book's), and its progression (`ClassProgression`).
 */
export class ClassSeeds {
  constructor(ref: ClassReference, tools: readonly string[]) {
    this.entries = new ClassEntries(ref);
    this.features = new ClassFeatureFeats(this.entries);
    this.proficiencies = new ClassProficiencies(this.entries, tools);
    this.progression = new ClassProgression(this.entries);
  }

  /** Its entries, as its overrides correct them. */
  private readonly entries: ClassEntries;
  /** Its features' and subclasses' feats. */
  private readonly features: ClassFeatureFeats;
  /** Its proficiencies' feats. */
  private readonly proficiencies: ClassProficiencies;
  /** Its progression: its caster type, its levels' modifiers, its spells. */
  private readonly progression: ClassProgression;

  /** The class's description: its hit die and its primary abilities. */
  private description(): string {
    const { hit_die, primary_ability } = this.entries.entry();
    return `A class of a d${hit_die} Hit Point Die per level, whose primary ability is ${primary_ability.desc}.`;
  }

  /** The feats of its own features, of its subclasses and their features, and of its proficiencies. */
  feats(): FeatSeed[] {
    return [
      ...this.features.classFeats(),
      ...this.features.subclassFeats(),
      this.proficiencies.startingFeat(),
      this.proficiencies.multiclassFeat(),
    ];
  }

  /** Its feature named `feature`'s feat's name, if it has that feature ("Fighting Style (Fighter)"). */
  featureFeat(feature: string): string | undefined {
    const has = this.entries.levels().some(({ features }) => features.some(({ name }) => name === feature));
    return has ? ClassFeatureFeats.featName(feature, this.entries.name()) : undefined;
  }

  /** The class's name. */
  name(): string {
    return this.entries.name();
  }

  /**
   * Its class's seed: its name and description, hit die and how its levels count toward a multiclass's spell slots, its links (its spellcasting ability, its
   * proficiencies' feats), its skills, its features by level through its features' pool, its levels' modifiers, its
   * multiclass's requirements and its spells.
   */
  seed(): ClassSeed {
    const name = this.entries.name();
    const { hit_die, spellcasting } = this.entries.entry();
    const modifiers = this.progression.modifiers();
    const requirements = this.progression.requirements();
    const spells = this.progression.spells();
    return {
      name,
      description: this.description(),
      fields: { [CLASS_HD]: hit_die, [CLASS_MULTICLASS_SLOTS]: this.progression.multiclassSlots() },
      links: {
        ...(spellcasting ? { spellcastingAbility: readAbility(spellcasting.spellcasting_ability.name) } : {}),
        startingProficiencies: ClassProficiencies.startingName(name),
        multiclassProficiencies: ClassProficiencies.multiclassName(name),
      },
      classSkills: this.proficiencies.classSkills(),
      featurePool: classFeatures(name),
      features: this.features.features(),
      ...(modifiers.length > 0 ? { modifiers } : {}),
      ...(requirements.length > 0 ? { requirements } : {}),
      ...(spells ? { spells } : {}),
    };
  }

  /** The tools its tool picks are among, by the pool they're picked in. */
  toolPicks(): ToolPicks[] {
    return this.proficiencies.toolPicks();
  }
}
