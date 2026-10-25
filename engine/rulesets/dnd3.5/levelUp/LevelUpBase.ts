import { type CharacterInput, type ChildrenPlan, type PickPlan, type StoredPick } from "@/engine/core/module/index.ts";
import RulesError, { type RulesIssue } from "@/engine/core/RulesError.ts";
import type { RulesetData, RulesetView } from "@/engine/core/view/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Klass, KlassLevel } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import type { Character } from "@/shared/relations.ts";

import CharacterProjection from "./CharacterProjection.ts";
import type { OverfullPool } from "./PicksDistribution.ts";
import type { AbilityIncrease, LevelPicks, LevelRequest } from "./requests.ts";
import SelectionChecks from "./SelectionChecks.ts";

/** The hit points a level of a class gains, as its hit die bounds them: the least, the most, and the average. */
export interface LevelHitPoints {
  average: number;
  max: number;
  min: number;
}

/**
 * What the level-up rules decide (`Dnd35LevelUp`), which every level-up flow reads: how a character is built (`C`),
 * what a level's ability increases add up to, the hit points it gains and those it counts before they're rolled, and
 * what a master's bonded creatures become with it; and what a save's checks (`LevelsPlanning`) ask of them: its planned
 * levels, its picks spread over them, the pools they overfill, the issues an edited level answers for.
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
  /** What the ability increases of the level after `totalLevel` levels add up to in the view's ruleset: 0 for none. */
  getAbilityIncreaseTotal(view: RulesetView, totalLevel: number): number;
  /**
   * Each planned level's class and class level, with its ability increases (`levels`), the ruleset's: refused when a
   * class or a class level isn't, or the levels go past its bounds.
   */
  getPlannedKlassLevels(
    view: RulesetView,
    input: CharacterInput,
    levels: Omit<LevelRequest, "hp">[],
  ): PlannedClassLevel[];
  /** The hit points a level of a class with hit die `hd` gains: the least, the most, and the average. */
  hitPointsOf(hd: number): LevelHitPoints;
  /**
   * What the bonded creatures (`bonded`, their rows) become with their master as `master` builds it, from its row
   * (`record`), which a creature it makes takes after.
   */
  planBondedCreatures(view: RulesetView, master: C, record: Character, bonded: CharacterInput[]): ChildrenPlan;
  /** The hit points a level counts before they're rolled: a level a flow projects, whose hit points its save sets. */
  readonly unrolledLevelHp: number;
}

/** A level a level-up plans: its class and class level, and its ability increases. */
export interface PlannedClassLevel {
  abilityIncreases: AbilityIncrease[];
  klass: Klass;
  klassLevel: KlassLevel;
}

/** A saved level's picks, by its steps: its hit points, ability increases, skill ranks, feats and spells. */
export type SavedLevelPicks = Record<"abilities" | "feats" | "hp" | "skills" | "spells", StoredPick[]>;

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
      const spell = this.dnd35.spellsById.get(spellId);
      if (!spell) continue;
      for (const link of this.dnd35.listLinksOf(spell.id)) lookup.set(`${link.fromId}:${link.toId}`, link.tier);
    }
    return lookup;
  }

  /** A level's selections checked against the ruleset, and its ability increases against its rules. */
  protected get checks(): SelectionChecks {
    return new SelectionChecks(this.view, this.rules);
  }

  /** The view's 3.5 lists and indices. */
  protected get dnd35(): Dnd35View {
    return Dnd35View.of(this.rulesetData);
  }

  /** The class's level `level`, in the composed ruleset, or a 404. */
  protected getKlassLevel(klassId: string, level: number) {
    const klassLevel = this.dnd35.klassLevelByKlassAndLevel.get(`${klassId}:${level}`);
    if (!klassLevel) throw new RulesError("not-found", "Class level not found");
    return klassLevel;
  }

  /** A saved character level's class level (its advancement's track) and class, in the composed ruleset, or a 404. */
  protected getSavedKlassLevel(characterLevel: { trackId: string | null }) {
    const klassLevel = characterLevel.trackId ? this.dnd35.klassLevelsById.get(characterLevel.trackId) : undefined;
    if (!klassLevel) throw new RulesError("not-found", "Class level not found");

    const klass = this.dnd35.klassesById.get(klassLevel.ownerId);
    if (!klass) throw new RulesError("not-found", "Class not found");

    return { klassLevel, klass };
  }

  /**
   * The picks saved level `characterLevelId` holds, by step, as the character's rows hold them: its hit points, its
   * ability increases, its skill ranks, and its feats and spells, each in its pool; none for a level it hasn't saved (a
   * level-up's).
   */
  protected getSavedPicks(characterLevelId: string | undefined): SavedLevelPicks {
    const { picks } = this.character.rows;
    const atLevel = (step: keyof SavedLevelPicks) =>
      picks[step].filter((pick) => pick.advancementId === characterLevelId);
    return {
      hp: atLevel("hp"),
      abilities: atLevel("abilities"),
      skills: atLevel("skills"),
      feats: atLevel("feats"),
      spells: atLevel("spells"),
    };
  }

  /**
   * What the character's bonded creatures (`bonded`, their rows) become with it as `master` builds it: each kind's
   * creature removed, kept or made, and the levels it takes or loses.
   */
  protected planBondedOf(master: C, bonded: CharacterInput[]) {
    return this.rules.planBondedCreatures(this.view, master, this.character.record, bonded);
  }

  protected get rulesetData(): RulesetData {
    return this.view.rulesetData;
  }

  /**
   * A level's picks as a save writes them: its feats and its spells, each in its pool, and its skill ranks but those at
   * none.
   */
  protected toPickPlans({ feats, spells, skills }: LevelPicks): PickPlan[] {
    const pooled = (step: string, byPool: Record<string, string[]>) =>
      Object.entries(byPool).flatMap(([viaId, ids]) => ids.map((entityId) => ({ step, entityId, viaId })));
    return [
      ...pooled("feats", feats),
      ...pooled("spells", spells),
      ...Object.entries(skills)
        .filter(([, rank]) => rank > 0)
        .map(([entityId, amount]) => ({ step: "skills", entityId, amount })),
    ];
  }
}
