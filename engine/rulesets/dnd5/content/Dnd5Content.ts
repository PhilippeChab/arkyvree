import { ContentPart } from "@/engine/core/module/index.ts";
import type { Dnd5Descriptions } from "@/engine/rulesets/dnd5/descriptions.ts";
import ExpertiseFeats from "@/engine/rulesets/dnd5/entities/feats/ExpertiseFeats.ts";
import GeneratedFeats from "@/engine/rulesets/dnd5/entities/feats/GeneratedFeats.ts";
import SkillProficiencyFeats from "@/engine/rulesets/dnd5/entities/feats/SkillProficiencyFeats.ts";
import ClassProgressions from "@/engine/rulesets/dnd5/rules/ClassProgressions.ts";
import { EXPERTISE_POOL, SKILL_PROFICIENCIES_POOL } from "@/vocabulary/dnd5/feats.ts";

import BookPaths from "./BookPaths.ts";

/**
 * The D&D 5th Edition module's content, as the seeders and the codegen ask of it: what a book's modifiers and requirements can
 * target, the progressions a class's levels follow, and what a skill brings.
 */
export default class Dnd5Content extends ContentPart<Dnd5Descriptions> {
  /**
   * What a skill brings (`kind` "skills"): its Skill Proficiency and its Expertise, as the engine makes them for a skill a
   * ruleset adds (`SkillProficiencyFeats`, `ExpertiseFeats`), which the seeders write for the book's own.
   */
  override describeBroughtEntities(kind: string, name: string) {
    if (kind !== "skills") return [];
    return [
      ...SkillProficiencyFeats.describe(name).map((feat) => GeneratedFeats.toBrought(feat, SKILL_PROFICIENCIES_POOL)),
      ...ExpertiseFeats.describe(name).map((feat) => GeneratedFeats.toBrought(feat, EXPERTISE_POOL)),
    ];
  }

  /** What every class's levels follow, by level: the Proficiency Bonus. */
  override describeLevelPresets() {
    return ClassProgressions.describePresets();
  }

  /** The target paths a book's generated content may name. */
  override listBookTargetPaths(...args: Parameters<typeof BookPaths.listBookTargetPaths>) {
    return BookPaths.listBookTargetPaths(...args);
  }
}
