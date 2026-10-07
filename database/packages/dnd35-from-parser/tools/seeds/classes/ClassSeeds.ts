import { normalizeDescription } from "@/database/packages/dnd35-from-parser/tools/text/scrapedText.ts";
import type { ClassSeed } from "@/database/packages/dnd35/content/classes/types.ts";
import type { FeatSeed } from "@/database/packages/dnd35/content/feats/types.ts";
import { include } from "@/server/mixins.ts";

import { BaseClassSeeds } from "./BaseClassSeeds.ts";
import { AptitudePicks } from "./concerns/AptitudePicks.ts";
import { Features } from "./concerns/Features.ts";
import { LevelModifiers } from "./concerns/LevelModifiers.ts";
import { OwnFeats } from "./concerns/OwnFeats.ts";
import { Spellcasting } from "./concerns/Spellcasting.ts";

/**
 * A class's seeds: its seed (`seed`) and the feats it makes (`feats`), built from what both decide alike
 * (`BaseClassSeeds`: its picks, its features' feat names, the existing feats they grant), a part of them per concern
 * (`concerns/`).
 */
export class ClassSeeds extends include(
  BaseClassSeeds,
  AptitudePicks,
  Features,
  LevelModifiers,
  OwnFeats,
  Spellcasting,
) {
  /** The feats the class makes: its own features', the one advancing its spellcasting, its domain pool's. */
  feats(): FeatSeed[] {
    return this.memo("feats", () => [
      ...this.ownFeats(),
      ...this.spellcastingAdvanceFeats(),
      ...this.domainPickFeats(),
    ]);
  }

  /**
   * What's left to review in the class, which opens its generated file: what the detection couldn't resolve, unless
   * the overrides name the key (even empty: reviewed).
   */
  reviewNotes(): string[] {
    const { detected } = this.ref;
    const overrides = this.ref.overrides ?? {};
    const todos: string[] = [];
    if (!("requirements" in overrides) && detected.unresolvedPrereqs?.length)
      for (const p of detected.unresolvedPrereqs) todos.push(p);

    if (!("aptitudePicks" in overrides) && detected.unresolvedAptitudePicks?.length)
      for (const a of detected.unresolvedAptitudePicks) todos.push(`Unresolved aptitude pick: "${a}"`);

    if (!("modifiers" in overrides) && !("columns" in overrides))
      todos.push("No modifiers defined — review if this class needs any");

    return todos;
  }

  /**
   * The class's seed: its summary (name, description, hit die, levels, skills, BAB, saves, requirements), its features
   * and the feats it grants, its spellcasting, its level modifiers and its aptitude picks. Each is built in the order
   * its file is written, so a class the generator refuses fails on the same field.
   */
  seed(): ClassSeed {
    return this.memo("seed", () => {
      const { detected, mapping, raw } = this.ref;
      const requirements = this.book.familyChecks(mapping.requirements);
      const { classFeatures, autoFreeFeats } = this.classFeatures();
      const freeFeats = [...(mapping.freeFeats ?? []), ...autoFreeFeats];
      const casting = this.casting();
      const spells = this.spells();
      const modifiers = this.levelModifiers();
      const aptitudePicks = this.seedAptitudePicks();
      return {
        name: raw.name,
        description: normalizeDescription(mapping.description),
        hd: detected.hd,
        levels: detected.levels,
        skillPoints: detected.skillPoints,
        bab: mapping.bab,
        saves: mapping.saves,
        classSkills: mapping.classSkills,
        requirements,
        ...(detected.casterLevelAdvancement ? { casterLevelAdvancement: detected.casterLevelAdvancement } : {}),
        ...(mapping.classFeatureAptitude ? { classFeatureAptitude: mapping.classFeatureAptitude } : {}),
        ...(classFeatures.length > 0 ? { classFeatures } : {}),
        ...(mapping.proficiencies?.length ? { proficiencies: mapping.proficiencies } : {}),
        ...(freeFeats.length > 0 ? { freeFeats } : {}),
        ...casting,
        ...(spells ? { spells } : {}),
        ...(modifiers.length > 0 ? { modifiers } : {}),
        ...(aptitudePicks.length > 0 ? { aptitudePicks } : {}),
      };
    });
  }
}
