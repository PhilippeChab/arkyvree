import type { AdvancementPlan, CharacterInput, ChildrenPlan } from "@/engine/core/module/index.ts";
import type { RulesIssue } from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

import CharacterProjection from "./CharacterProjection.ts";
import LevelsPlanning, { type CheckedCharacter } from "./LevelsPlanning.ts";
import type { LevelUpRules } from "./LevelUpBase.ts";
import type { LevelPicks, LevelRequest } from "./requests.ts";

/**
 * A character's levels saved one at a time, as if leveled up level by level (an import's): each level a level-up of its
 * own over the character's rows with the levels before it (`character`), checked as a level-up checks it
 * (`LevelsPlanning`), saved forced, with what the character with it fails of what an unforced level-up would refuse.
 * What a level-up refuses even forced (a level taken twice, a pick the character holds, a pool its picks overfill)
 * refuses it, which its caller reads as the level it can't take.
 */
export default class LevelByLevel<C extends CheckedCharacter> {
  constructor(
    private readonly view: RulesetView,
    character: CharacterInput,
    private readonly rules: LevelUpRules<C>,
  ) {
    this.input = character;
  }

  /** The character's rows with the levels saved so far. */
  private input: CharacterInput;

  /** The character built from its rows with the levels saved so far. */
  buildCharacter(): C {
    return this.rules.buildCharacter(this.view, this.input);
  }

  /** The character's rows with the levels saved so far, as the next level reads them. */
  get character(): CharacterInput {
    return this.input;
  }

  /**
   * What the character's bonded creatures become with its levels saved so far: those its levels make it, read off the
   * character with them (`character`, its caller's when it built it already).
   */
  planBonded(character: C = this.buildCharacter()): ChildrenPlan {
    return this.rules.planBondedCreatures(this.view, character, this.input.record, []);
  }

  /**
   * The next level (`level`, with its `picks`), saved after those before it, forced: what it writes, and what the
   * character with it fails of what a level-up checks (none when it passes), as an unforced level-up would refuse it.
   */
  planLevel(level: LevelRequest, picks: LevelPicks): { issues: RulesIssue[]; writes: AdvancementPlan } {
    const planned = new LevelsPlanning(this.view, this.input, this.rules).planLevelsForced({ levels: [level], picks });
    const [writes] = planned.advancements;
    const projection = new CharacterProjection(this.input);
    projection.addAdvancement(writes);
    this.input = projection.input;
    return { issues: planned.issues, writes };
  }
}
