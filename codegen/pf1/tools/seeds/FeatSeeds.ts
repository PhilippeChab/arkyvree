import { type DetectedFeat, FeatDetector } from "@/codegen/pf1/tools/detect/feats/FeatDetector.ts";
import { FAMILY_OPTIONS, type FamilyOptions } from "@/codegen/pf1/tools/terms/featOptions.ts";
import type { FeatReference } from "@/codegen/pf1/tools/types/feats.ts";
import type { FeatSeed } from "@/content/pf1/builders/feats/types.ts";
import { buildCoreFeats } from "@/content/pf1/data/feats/coreFeats.ts";
import { stripSeparators } from "@/shared/text.ts";

import { Memos } from "./Memos.ts";

/**
 * A family of feats taken for an option (Weapon Focus), as its leading feat's page gives it: its feats are made per
 * option by the generated code, each named `<family>: <option>`, its description and paths naming the option where
 * they name `OPTION`.
 */
export interface FeatFamily extends DetectedFeat {
  family: string;
  /** What its feats are taken for. */
  options: FamilyOptions;
}

/**
 * A feat reference's seeds: every feat of its book, read from its page (`FeatDetector`), but those the core rules write
 * by hand (`buildCoreFeats`: the weapon, armor and shield proficiencies, a feat or a family of its name). A family of
 * feats taken for an option (Weapon Focus, Skill Focus…) is one seed, named after the family, which the generated code
 * makes a feat per option of (`family`): an aptitude its seed is given (a class's bonus feats') is each of its feats'.
 * What's left to review in its feats is its `notes`.
 */
export class FeatSeeds {
  constructor(readonly ref: FeatReference) {}

  /** What's built of the reference, once. */
  private readonly memos = new Memos();

  /** Its feats, read, but those the core rules write by hand. */
  private detected(): DetectedFeat[] {
    return this.memos.of("detected", () => {
      const bookFeats = new Set(this.ref.raw.map(({ name }) => name));
      const handWritten = buildCoreFeats().map(({ name }) => name);
      return this.ref.raw
        .map((entry) => new FeatDetector(entry, bookFeats).detect())
        .filter((feat) => !this.isHandWritten(feat, handWritten));
    });
  }

  /**
   * Whether the core rules write a feat by hand (among `handWritten`, by its slug: "Armor Proficiency (Light)" is
   * "Armor Proficiency, Light"): itself, or, for a feat of no family the generator makes, its family's feats ("Exotic
   * Weapon Proficiency: Bastard Sword"). A family the generator makes may share none of its feats with them (Weapon
   * Focus's, with Weapon Focus: Ray): it would make them twice.
   */
  private isHandWritten({ name, family }: DetectedFeat, handWritten: readonly string[]): boolean {
    const slugs = new Set(handWritten.map(stripSeparators));
    if (slugs.has(stripSeparators(name))) return true;
    if (!family) return handWritten.some((written) => written.startsWith(`${name}: `));
    const twice = FAMILY_OPTIONS[family].names.filter((option) => slugs.has(stripSeparators(`${name}: ${option}`)));
    if (twice.length > 0) throw new Error(`${family}'s feats for ${twice.join(", ")} are written by hand too`);
    return false;
  }

  /** The family of feats taken for an option named `name`, if the book's feats lead one. */
  family(name: string): FeatFamily | undefined {
    const detected = this.detected().find((feat) => feat.family === name);
    return detected?.family
      ? { ...detected, family: detected.family, options: FAMILY_OPTIONS[detected.family] }
      : undefined;
  }

  /** What's left to review in its feats: the prerequisites and the benefits no reading takes. */
  notes(): string[] {
    return this.detected().flatMap(({ notes }) => notes);
  }

  /** Its feats, each with its aptitudes, requirements, modifiers and fields: a family's once, named after it. */
  seeds(): FeatSeed[] {
    return this.detected().map(({ name, description, aptitudes, requirements, modifiers, fields }) => ({
      name,
      description,
      aptitudes,
      ...(requirements.length > 0 ? { requirements } : {}),
      ...(modifiers.length > 0 ? { modifiers } : {}),
      ...(Object.keys(fields).length > 0 ? { fields } : {}),
    }));
  }
}
