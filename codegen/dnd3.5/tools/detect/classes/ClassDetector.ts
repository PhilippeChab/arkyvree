import { normalizeWs } from "@/codegen/core/text/whitespace.ts";
import { type Resolved } from "@/codegen/dnd3.5/tools/detect/BaseDetector.ts";
import { BenefitModifiers } from "@/codegen/dnd3.5/tools/detect/readers/modifiers/BenefitModifiers.ts";
import { ProficiencyModifiers } from "@/codegen/dnd3.5/tools/detect/readers/modifiers/ProficiencyModifiers.ts";
import { ClassPrerequisites } from "@/codegen/dnd3.5/tools/detect/readers/requirements/ClassPrerequisites.ts";
import { getFeatureBaseName } from "@/codegen/dnd3.5/tools/text/names.ts";
import { type ClassReference } from "@/codegen/dnd3.5/tools/types/classes.ts";
import type { NamedText } from "@/codegen/dnd3.5/tools/types/reference.ts";
import { include } from "@/lib/mixins.ts";

import { BaseClassDetector } from "./BaseClassDetector.ts";
import { ClassMapping } from "./ClassMapping.ts";
import { ClassPools } from "./ClassPools.ts";
import { ReadsAptitudePicks } from "./concerns/ReadsAptitudePicks.ts";
import { ReadsBonusFeatLists } from "./concerns/ReadsBonusFeatLists.ts";
import { ReadsFavoredEnemies } from "./concerns/ReadsFavoredEnemies.ts";

/** The feature whose text names the proficiencies the class grants (`ProficiencyModifiers`). */
const PROFICIENCY_FEATURE = "Weapon and Armor Proficiency";

/** A feature's modifiers: its text read as a feat's benefit, and a proficiency feature's the proficiencies it grants. */
function readFeature({ name, description }: NamedText) {
  const benefit = new BenefitModifiers(description);
  const proficiencies = name === PROFICIENCY_FEATURE ? new ProficiencyModifiers(description).modifiers : [];
  return {
    errors: benefit.errors,
    modifiers: [...proficiencies, ...benefit.modifiers],
    unresolved: benefit.unresolved,
  };
}

/**
 * A class reference's detector: what its page gives (`detected`), read by its concerns (`concerns/`: the features
 * where its player picks, the existing feats it lets them pick, the favored enemies it locks), its table
 * (`ClassTable`) and its features' text, and the entities it makes (`mapping`, a `ClassMapping`), its overrides
 * applied.
 */
export class ClassDetector extends include(
  BaseClassDetector,
  ReadsAptitudePicks,
  ReadsBonusFeatLists,
  ReadsFavoredEnemies,
) {
  /** The class's detected section. */
  protected override detected(): ClassReference["detected"] {
    const { raw } = this;
    const { requirements, errors, unresolved } = new ClassPrerequisites(raw.prerequisites.parsed);
    const spellsPerDay = this.table.spellsPerDay();
    const spellsKnown = this.table.spellsKnown();
    const hasOwnSpells = spellsPerDay !== undefined;
    const aptitudePicks = this.aptitudePicks();

    return {
      hd: this.hitDie(),
      levels: raw.progression.length,
      skillPoints: this.skillPoints(),
      bab: this.table.bab(),
      saves: this.table.saves(),
      casterLevelAdvancement: this.table.casterAdvancement(),
      requirements,
      featureModifiers: this.featureModifiers(
        new ClassPools(this, { ...aptitudePicks, featureOccurrences: this.featureOccurrences }),
      ),
      featureOccurrences: this.featureOccurrences,
      ...aptitudePicks,
      ...this.bonusFeatLists(),
      ...this.lockedFavoredEnemies(),
      ...(spellsPerDay ? { spellsPerDay } : {}),
      ...(spellsKnown ? { spellsKnown } : {}),
      ...(hasOwnSpells ? { hasOwnSpells } : {}),
      ...(hasOwnSpells ? this.casterType() : {}),
      ...(errors.length > 0 ? { errors } : {}),
      ...(unresolved.length > 0 ? { unresolvedPrereqs: unresolved } : {}),
    };
  }

  /** The class's entities, a `ClassMapping`'s: what's detected and scraped, its overrides applied. */
  protected override mapping(detected: ClassReference["detected"]): ClassReference["mapping"] {
    return new ClassMapping(this, detected).build();
  }

  /**
   * The reference with what's derived from it (`BaseDetector.resolve`), its raw the one the class is read from: its
   * alignment filled in from its overrides when its page names none.
   */
  override resolve(): Resolved<ClassReference> {
    return { ...super.resolve(), raw: this.raw };
  }

  /** The kind of spells the class casts, as its features' text says. */
  private casterType(): { casterType?: "Arcane" | "Divine" } {
    const text = this.raw.classFeatures.map((f) => f.description).join(" ");
    if (/casts?\b.{0,30}\barcane spells/i.test(text) || /arcane spell failure/i.test(text))
      return { casterType: "Arcane" };
    if (/casts?\b.{0,30}\bdivine spells/i.test(text) || /\bdivine focus\b/i.test(text)) return { casterType: "Divine" };
    return {};
  }

  /**
   * Each feature's modifiers, by its base name, with what its text leaves unread (`readFeature`): not a pool's, nor its
   * options' (`pools`), which are features without modifiers.
   */
  private featureModifiers(pools: ClassPools): ClassReference["detected"]["featureModifiers"] {
    const features = this.raw.classFeatures.flatMap(({ name, description }) => {
      const baseName = getFeatureBaseName(name);
      if (pools.isPool(name, baseName) || pools.isOrphan(baseName)) return [];
      return [{ name: baseName, description: normalizeWs(description) }];
    });
    return this.modifiersOf(features, readFeature);
  }

  /** The class's hit die ("d10" → 10), d8 when it gives none. */
  private hitDie(): number {
    const match = this.raw.hitDie.match(/d(\d+)/);
    return match ? parseInt(match[1], 10) : 8;
  }

  /** The class's skill points per level, 2 when it gives none. */
  private skillPoints(): number {
    const match = this.raw.skillPointsPerLevel.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 2;
  }
}
