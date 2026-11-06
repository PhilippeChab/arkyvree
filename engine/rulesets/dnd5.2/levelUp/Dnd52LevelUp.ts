import {
  AdvancementsPart,
  type CharacterInput,
  type OpenedStepPicker,
  type ResolvedEdit,
  type ResolvedPlan,
  type StepPickerQuery,
  type StoredAdvancement,
} from "@/engine/core/module/index.ts";
import type { RulesIssue } from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd5.2/model/DetailedCharacter.ts";
import Dnd52CharacterBuilder from "@/engine/rulesets/dnd5.2/model/Dnd52CharacterBuilder.ts";
import ClassPicker from "@/engine/rulesets/dnd5.2/pickers/ClassPicker.ts";
import FeatPicker from "@/engine/rulesets/dnd5.2/pickers/FeatPicker.ts";
import SpellPicker from "@/engine/rulesets/dnd5.2/pickers/SpellPicker.ts";
import { FIXED_HIT_POINTS_BY_DIE, LEVEL_WORD } from "@/vocabulary/dnd5.2/classes.ts";

import LevelPlans from "./LevelPlans.ts";
import LevelRemoval from "./LevelRemoval.ts";
import LevelsPlanning from "./LevelsPlanning.ts";
import LevelUpBase, { type LevelUpRules } from "./LevelUpBase.ts";
import LevelUpPlan from "./LevelUpPlan.ts";

/**
 * The D&D 5th Edition level-up, as the module answers the server's level flows, each from the rows the server read: a
 * level's steps, the plan's answer and a step's picker, a saved level as an edit's plan, and what a level-up, an edit
 * and a removal write, checked in order (`LevelsPlanning`); and the rules its flows read (`LevelUpRules`). A character
 * has no children: no class of the 2024 rules levels a companion.
 */
export default class Dnd52LevelUp extends AdvancementsPart implements LevelUpRules<DetailedCharacter> {
  /** A character level's word, which the engine's refusals and its sheets' summary name one by. */
  override readonly advancementWord = LEVEL_WORD;

  /** The plan's answer: Add Level's plan or Edit Level's level, each step in its mechanic's shape. */
  override describePlan(view: RulesetView, character: CharacterInput, plan: ResolvedPlan) {
    return new LevelPlans(view, character, this).describePlan(plan);
  }

  /** A saved level as an edit's plan opens it: each step's payload as the level saved it. */
  override describeSavedPlan(view: RulesetView, character: CharacterInput, level: StoredAdvancement) {
    return new LevelPlans(view, character, this).describeSavedPlan(level);
  }

  /**
   * A D&D 5th Edition level's steps, in the wizard's order: its class plan (but an edit's), hit points, ability increase, skills,
   * feats and spells.
   */
  override listSteps(view: RulesetView, character: CharacterInput, edited: boolean) {
    return new LevelPlans(view, character, this).listSteps(edited);
  }

  /**
   * Step `step`'s picker over the plan: the class picker (the class plan's), reading classes as tracks, or a feat or
   * spell pool's at the level its next pick lands on, reading the pool's spells, its feats grouped by family, or a
   * family's feats when the query names one.
   */
  override openStepPicker(
    view: RulesetView,
    character: CharacterInput,
    step: string,
    query: StepPickerQuery<ResolvedPlan>,
  ): OpenedStepPicker {
    const read = new LevelPlans(view, character, this).readStepPicker(step, query);
    switch (read.kind) {
      case "feats": {
        const picker = new FeatPicker(view, character, read.query);
        // A family's feats when the query names one, else the pool's feats grouped by family
        return read.query.family
          ? { kind: read.kind, read: "options", picker }
          : { kind: read.kind, read: "groups", picker };
      }
      case "classes":
        return { kind: read.kind, read: "tracks", picker: new ClassPicker(view, character, read.planned) };
      case "spells":
        return { kind: read.kind, read: "options", picker: new SpellPicker(view, character, read.query) };
    }
  }

  /**
   * A plan's level-up, read as its save writes it (its levels, each with its hit points, and its picks, spread over
   * them): the rows it writes, each level checked and the character with them unless `force`d.
   */
  override planAddition(
    view: RulesetView,
    character: CharacterInput,
    _children: CharacterInput[],
    plan: ResolvedPlan,
    force: boolean,
  ) {
    const levelUp = new LevelPlans(view, character, this).readLevelUp(plan);
    return new LevelsPlanning(view, character, this).planLevels(levelUp, force);
  }

  /**
   * A plan's edit of its saved level (`plan.editedAdvancement`), read as its save writes it (the level's hit points and
   * picks): what it writes, checked unless `force`d.
   */
  override planAdvancementEdit(
    view: RulesetView,
    character: CharacterInput,
    _children: CharacterInput[],
    plan: ResolvedEdit,
    force: boolean,
  ) {
    const edit = new LevelPlans(view, character, this).readEdit(plan);
    return new LevelsPlanning(view, character, this).planEdit(plan.editedAdvancement, edit, force);
  }

  /** A character's children: none, as no class of the 2024 rules levels a companion. */
  override planChildren() {
    return LevelUpBase.NO_CHILDREN;
  }

  /** The character's last level removed: the level that goes. */
  override planRemoval(view: RulesetView, character: CharacterInput) {
    return new LevelRemoval(view, character, this).planRemoval();
  }

  /** The D&D 5th Edition character built from its rows. */
  buildCharacter(view: RulesetView, input: CharacterInput) {
    return Dnd52CharacterBuilder.build(view, input);
  }

  /**
   * A save's pooled picks spread over its planned levels: each skill's points within each level's points and max ranks,
   * class skills first, and the feats and spells in each level's pool slots.
   */
  distributePicks(view: RulesetView, character: CharacterInput, ...args: Parameters<LevelUpPlan["distributePicks"]>) {
    return new LevelUpPlan(view, character, this).distributePicks(...args);
  }

  /**
   * The issues an edited level answers for: all the character's (`issues`) but those of the pools the level doesn't add
   * to, which the levels before it or after it give. A level adds to a pool (an aptitude, or a leveled one's spell level)
   * the character allows more of with it (`withLevel`) than without it (`before`). A pool's issue carries the pool: its
   * aptitude's id (`entityId`) and its spell level (`tier`).
   */
  findEditedLevelIssues(issues: RulesIssue[], before: DetailedCharacter, withLevel: DetailedCharacter) {
    const poolKey = (id: string, spellLevel?: number) => `${id}:${spellLevel ?? ""}`;
    const allowedBefore = new Map(
      before.components.aptitudes.getSlotPools().map((pool) => [poolKey(pool.id, pool.spellLevel), pool.allowed]),
    );
    const owned = new Set<string>();
    for (const { id, spellLevel, allowed } of withLevel.components.aptitudes.getSlotPools())
      if (allowed > (allowedBefore.get(poolKey(id, spellLevel)) ?? 0)) owned.add(poolKey(id, spellLevel));

    return issues.filter(
      (issue) =>
        issue.category !== "aptitudes" ||
        (issue.entityId !== undefined && owned.has(poolKey(issue.entityId, issue.tier))),
    );
  }

  /** The pools a save's picks overfill, as the character holding them counts them. */
  findOverfullPools(
    view: RulesetView,
    character: CharacterInput,
    ...args: Parameters<LevelUpPlan["findOverfullPools"]>
  ) {
    return new LevelUpPlan(view, character, this).findOverfullPools(...args);
  }

  /**
   * Each planned level's class and class level: within the rules' bounds (a class's last level, a character's), a
   * player character's class of the view, and one of its levels.
   */
  getPlannedClassLevels(
    view: RulesetView,
    character: CharacterInput,
    ...args: Parameters<LevelUpPlan["getPlannedClassLevels"]>
  ) {
    return new LevelUpPlan(view, character, this).getPlannedClassLevels(...args);
  }

  /**
   * The hit points a level after a character's first gains, of a class with hit die `hd`: a roll of it, or the Fixed
   * Hit Points by Class table's value, its average (`FIXED_HIT_POINTS_BY_DIE`: half the die, plus 1).
   */
  hitPointsOf(hd: number) {
    return { average: FIXED_HIT_POINTS_BY_DIE[hd] ?? Math.floor(hd / 2) + 1, max: hd, min: 1 };
  }
}
