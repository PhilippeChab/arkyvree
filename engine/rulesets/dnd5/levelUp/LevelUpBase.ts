import { type CharacterInput, type ChildrenPlan, type PickPlan, type StoredPick } from "@/engine/core/module/index.ts";
import type { RulesIssue } from "@/engine/core/RulesError.ts";
import type { RulesetData, RulesetView } from "@/engine/core/view/index.ts";
import LevelRules from "@/engine/rulesets/dnd5/rules/LevelRules.ts";
import Dnd5View from "@/engine/rulesets/dnd5/view/Dnd5View.ts";
import type { Feat, Klass, KlassLevel } from "@/engine/rulesets/dnd5/view/rows.ts";
import { CLASS_HD } from "@/vocabulary/dnd5/fields/index.ts";

import CharacterProjection from "./CharacterProjection.ts";
import type { OverfullPool } from "./PicksDistribution.ts";
import type { LevelPicks, LevelRequest } from "./requests.ts";
import SelectionChecks from "./SelectionChecks.ts";

/** The hit points a level of a class gains, as its hit die bounds them: the least, the most, and the average. */
export interface LevelHitPoints {
  average: number;
  max: number;
  min: number;
}

/**
 * What the level-up rules decide (`Dnd5LevelUp`), which every level-up flow reads: how a character is built (`C`), and
 * the hit points a level gains; and what a save's checks (`LevelsPlanning`) ask of them: its planned levels, its picks
 * spread over them, the pools they overfill, the issues an edited level answers for.
 */
export interface LevelUpRules<C> {
  /** The character built from its rows (as the server read them, or with what a level-up adds), in the ruleset's view. */
  buildCharacter(view: RulesetView, input: CharacterInput): C;
  /**
   * A save's pooled picks (`picks`) spread over its planned levels (`levels`, in order) of the character (`input`), as
   * the ruleset spreads them: each level's.
   */
  distributePicks(
    view: RulesetView,
    input: CharacterInput,
    levels: PlannedClassLevel[],
    picks: LevelPicks,
  ): LevelPicks[];
  /**
   * The issues an edited level answers for, of the character's with it (`issues`): read off the character as it was
   * before the level (`before`), and with the level alone after that (`withLevel`).
   */
  findEditedLevelIssues(issues: RulesIssue[], before: C, withLevel: C): RulesIssue[];
  /** The pools picks (`picks`) overfill in the character holding them (`holder`, built from `input` with them). */
  findOverfullPools(
    view: RulesetView,
    input: CharacterInput,
    holder: C,
    picks: Pick<LevelPicks, "feats" | "spells">,
  ): OverfullPool[];
  /**
   * Each planned level's class and class level (`levels`), the ruleset's: refused when a class or a class level isn't,
   * or the levels go past its bounds.
   */
  getPlannedClassLevels(
    view: RulesetView,
    input: CharacterInput,
    levels: Omit<LevelRequest, "hp">[],
  ): PlannedClassLevel[];
  /**
   * The hit points a level after a character's first gains, of a class with hit die `hd`: the least, the most, and the
   * average, which the rules' fixed value is.
   */
  hitPointsOf(hd: number): LevelHitPoints;
}

/** A level a level-up plans: its class and class level. */
export interface PlannedClassLevel {
  classLevel: KlassLevel;
  klass: Klass;
}

/** A saved level's picks, by its steps: its hit points, feats and spells. */
export type SavedLevelPicks = Record<"feats" | "hp" | "spells", StoredPick[]>;

/**
 * What every level-up flow reads: the ruleset's view, the character's rows (`character`) and the level-up rules
 * (`rules`), and the class levels the levels take, the picks they write.
 */
export default abstract class LevelUpBase<C> {
  constructor(
    protected readonly view: RulesetView,
    protected readonly character: CharacterInput,
    protected readonly rules: LevelUpRules<C>,
  ) {}

  /** What a character's levels make of its children: none, as no class of the 2024 rules levels a companion. */
  static readonly NO_CHILDREN: ChildrenPlan = { children: [] };

  /**
   * The first levels of the classes a character's levels (`levelIds`, their class levels) are of, each once: whose
   * requirements (their multiclass prerequisites) a multiclass meets in its current classes as in its new one.
   */
  static findFirstLevelIds(dnd5: Dnd5View, levelIds: string[]): string[] {
    const { classLevelByClassAndLevel, classLevelsById } = dnd5;
    const classIds = new Set(levelIds.flatMap((id) => classLevelsById.get(id)?.ownerId ?? []));
    return [...classIds].flatMap((classId) => classLevelByClassAndLevel.get(`${classId}:1`)?.id ?? []);
  }

  /** The character built from a level-up's projection of its rows: as saved, without one. */
  protected build(projection = new CharacterProjection(this.character)): C {
    return this.rules.buildCharacter(this.view, projection.input);
  }

  /**
   * `build`, which builds the character with a level's (or a level-up's) own feats and spells (`picks`, by pool), each
   * set of them built once: a save's checks and a preview's fit ask for the character with the same picks again.
   */
  protected buildOnce(build: (picks: Pick<LevelPicks, "feats" | "spells">) => C) {
    const built = new Map<string, C>();
    return (picks: Pick<LevelPicks, "feats" | "spells">) => {
      const key = JSON.stringify([picks.feats, picks.spells]);
      const character = built.get(key) ?? build(picks);
      built.set(key, character);
      return character;
    };
  }

  /**
   * The spell level of each of these spells in each pool it's linked to, by `spellId:aptitudeId`: a spell can be at
   * different levels in different pools (Wizard 1, Bard 0).
   */
  protected buildSpellLevelLookup(spellIds: string[]) {
    const lookup = new Map<string, number | null>();
    for (const spellId of spellIds) {
      const spell = this.dnd5.spellsById.get(spellId);
      if (!spell) continue;
      for (const link of this.dnd5.listLinksOf(spell.id)) lookup.set(`${link.fromId}:${link.toId}`, link.tier);
    }
    return lookup;
  }

  /** A level's selections and hit points checked against the ruleset. */
  protected get checks(): SelectionChecks {
    return new SelectionChecks(this.view);
  }

  /** The view's D&D 5th Edition lists and indices. */
  protected get dnd5(): Dnd5View {
    return Dnd5View.of(this.rulesetData);
  }

  /** The class's level `level`, in the composed ruleset, or a 404. */
  protected getClassLevel(classId: string, level: number) {
    const classLevel = this.dnd5.classLevelByClassAndLevel.get(`${classId}:${level}`);
    if (!classLevel) throw this.rulesetData.notFound("class-levels");
    return classLevel;
  }

  /** A saved level's class level (its advancement's entry) and class, in the composed ruleset, or a 404. */
  protected getSavedClassLevel(advancement: { entryId: string }) {
    const classLevel = this.dnd5.classLevelsById.get(advancement.entryId);
    if (!classLevel) throw this.rulesetData.notFound("class-levels");

    const klass = this.dnd5.classesById.get(classLevel.ownerId);
    if (!klass) throw this.rulesetData.notFound("classes");

    return { classLevel, klass };
  }

  /**
   * The picks saved level `advancementId` holds, by step, as the character's rows hold them: its hit points, and its
   * feats and spells, each in its pool; none for a level it hasn't saved (a level-up's).
   */
  protected getSavedPicks(advancementId: string | undefined): SavedLevelPicks {
    const { picks } = this.character.rows;
    const atLevel = (step: keyof SavedLevelPicks) =>
      (picks[step] ?? []).filter((pick) => pick.advancementId === advancementId);
    return { hp: atLevel("hp"), feats: atLevel("feats"), spells: atLevel("spells") };
  }

  /**
   * The feats a class level grants a character (`classLevelId`), as its sheet holds them: its `grants` links', and, at
   * a class's first level, its starting proficiencies (`startingFeatOf`: a first class's, `first`, or a multiclass's).
   */
  protected grantedFeatsAt(classLevelId: string, first: boolean): Feat[] {
    const { dnd5 } = this;
    const granted = dnd5.grantedFeatsOf(classLevelId).flatMap((grant) => dnd5.featsById.get(grant.toId) ?? []);
    const classLevel = dnd5.classLevelsById.get(classLevelId);
    const starting = classLevel && this.startingFeatOf(classLevel, first);
    return starting ? [starting, ...granted] : granted;
  }

  /**
   * Whether a saved level (`level`) is the character's first, which its hit points are its die's highest at, and its
   * class's starting proficiencies a first class's.
   */
  protected isFirstSaved(level: { id: string }): boolean {
    return this.character.rows.advancements.toSorted((a, b) => a.position - b.position)[0]?.id === level.id;
  }

  /**
   * The hit points a level of `klass` gains (`first`: the character's first, its hit die's highest alone), as the SRD
   * 5.2.1 gives them; any other level's, the rules' (`hitPointsOf`).
   */
  protected levelHitPointsOf(klass: Pick<Klass, "fields">, first: boolean): LevelHitPoints {
    const hd = klass.fields[CLASS_HD];
    return first ? { average: hd, max: hd, min: hd } : this.rules.hitPointsOf(hd);
  }

  /**
   * The two projections of a saved level (`advancementId`, of class level `classLevelId`) that say what it brings: the
   * character as it was before the level (`before`), and with the level alone after that (`withLevel`), its grants
   * and its picks (`picks`), at the hit points a level counts before they're rolled. What an edited level answers for
   * (`findEditedLevelIssues`), and what Edit Level lists it gives.
   */
  protected projectLevelContribution(
    advancementId: string,
    classLevelId: string,
    picks: Pick<LevelPicks, "feats" | "spells">,
  ) {
    const before = new CharacterProjection(this.character);
    before.dropLevelsFrom(advancementId);
    const withLevel = new CharacterProjection(this.character);
    withLevel.dropLevelsFrom(advancementId);
    withLevel.pick(withLevel.addLevel(classLevelId, { hp: LevelRules.UNROLLED_LEVEL_HP }), this.toPickPlans(picks));
    return { before, withLevel };
  }

  protected get rulesetData(): RulesetData {
    return this.view.rulesetData;
  }

  /**
   * The feat a class's first level grants as its starting proficiencies (`classLevel`, none at another level): its
   * class's `startingProficiencies` feat when it's the character's first level (`first`), its
   * `multiclassProficiencies` one when it multiclasses into it, as the character's sheet loads them.
   */
  protected startingFeatOf(classLevel: KlassLevel, first: boolean): Feat | undefined {
    if (classLevel.position !== 1) return undefined;
    const klass = this.dnd5.classesById.get(classLevel.ownerId);
    const featId = klass?.links[first ? "startingProficiencies" : "multiclassProficiencies"];
    return featId ? this.dnd5.featsById.get(featId) : undefined;
  }

  /** A level's picks as a save writes them: its feats and its spells, each in its pool. */
  protected toPickPlans({ feats, spells }: Pick<LevelPicks, "feats" | "spells">): PickPlan[] {
    const pooled = (step: string, byPool: Record<string, string[]>) =>
      Object.entries(byPool).flatMap(([viaId, ids]) => ids.map((entityId) => ({ step, entityId, viaId })));
    return [...pooled("feats", feats), ...pooled("spells", spells)];
  }

  /** Picks as a save writes them (`picks`) read back by pool: their feats' and their spells', as a level holds them. */
  protected toPooledPicks(picks: PickPlan[]): Pick<LevelPicks, "feats" | "spells"> {
    const pooled = (step: string) => {
      const pools: Record<string, string[]> = {};
      for (const { entityId, viaId } of picks.filter((pick) => pick.step === step))
        if (entityId && viaId) (pools[viaId] ??= []).push(entityId);
      return pools;
    };
    return { feats: pooled("feats"), spells: pooled("spells") };
  }
}
