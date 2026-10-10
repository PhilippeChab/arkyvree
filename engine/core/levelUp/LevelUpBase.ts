import {
  type BondedCreaturesPlan,
  type CharacterInput,
  CharacterProjection,
  type LevelPickRows,
  type LevelPicks,
} from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetData, RulesetView } from "@/engine/core/view/index.ts";
import type { Character } from "@/shared/relations.ts";

import SelectionChecks from "./SelectionChecks.ts";

/**
 * What a ruleset's level-up rules decide, which every level-up flow reads: how a character is built (`C`, the ruleset's
 * character), what a level's ability increases add up to, and what a master's bonded creatures become with it.
 */
export interface LevelUpRules<C> {
  /** The character built from its rows (as the server read them, or with what a level-up adds), in the ruleset's view. */
  buildCharacter(view: RulesetView, input: CharacterInput): C;
  /** What the ability increases of the level after `totalLevel` levels add up to: 0 when it takes none. */
  getAbilityIncreaseTotal(totalLevel: number): number;
  /**
   * What the bonded creatures (`bonded`, their rows) become with their master as `master` builds it, from its row
   * (`record`), which a creature it makes takes after.
   */
  planBondedCreatures(view: RulesetView, master: C, record: Character, bonded: CharacterInput[]): BondedCreaturesPlan;
}

/**
 * What every level-up flow reads: the ruleset's view, the character's rows (`character`) and its ruleset's level-up rules
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
   * The spell level of each of these powers in each pool it's linked to, by `powerId:aptitudeId`: a spell can be at
   * different levels in different pools (Wizard 1, Bard 0).
   */
  protected buildPowerLevelLookup(powerIds: string[]) {
    const lookup = new Map<string, number | null>();
    for (const powerId of powerIds) {
      const power = this.rulesetData.powersById.get(powerId);
      if (!power) continue;
      for (const pa of power.powersAptitudesInRules) lookup.set(`${pa.powerId}:${pa.aptitudeId}`, pa.level);
    }
    return lookup;
  }

  /** A level's selections checked against the ruleset, and its ability increases against its rules. */
  protected get checks(): SelectionChecks {
    return new SelectionChecks(this.rulesetData, this.rules);
  }

  /** The class's level `level`, in the composed ruleset, or a 404. */
  protected getKlassLevel(klassId: string, level: number) {
    const klassLevel = this.rulesetData.klassLevelByKlassAndLevel.get(`${klassId}:${level}`);
    if (!klassLevel) throw new RulesError("not-found", "Class level not found");
    return klassLevel;
  }

  /** A saved character level's class level and class, in the composed ruleset, or a 404. */
  protected getSavedKlassLevel(characterLevel: { klassLevelId: string }) {
    const klassLevel = this.rulesetData.klassLevelsById.get(characterLevel.klassLevelId);
    if (!klassLevel) throw new RulesError("not-found", "Class level not found");

    const klass = this.rulesetData.klassesById.get(klassLevel.klassId);
    if (!klass) throw new RulesError("not-found", "Class not found");

    return { klassLevel, klass };
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

  /** A level's picks as the rows a save writes: its skill ranks but those at none, and its feats and powers by pool. */
  protected toPickRows({ feats, powers, skills }: LevelPicks): LevelPickRows {
    return {
      feats: Object.entries(feats).flatMap(([aptitudeId, ids]) => ids.map((featId) => ({ featId, aptitudeId }))),
      powers: Object.entries(powers).flatMap(([aptitudeId, ids]) => ids.map((powerId) => ({ powerId, aptitudeId }))),
      skills: Object.entries(skills)
        .filter(([, rank]) => rank > 0)
        .map(([skillId, rank]) => ({ skillId, rank })),
    };
  }
}
