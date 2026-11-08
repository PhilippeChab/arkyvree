import { CLASS_HD } from "@/vocabulary/dnd5.2/fields/index.ts";
import { MAX_SPELL_LEVEL } from "@/vocabulary/dnd5.2/spells.ts";

import type { PoolPicks } from "./LevelUpState.ts";
import PicksDistribution from "./PicksDistribution.ts";
import PlannedLevelsState, { type LevelGains, type PlannedLevels } from "./PlannedLevelsState.ts";
import type { LevelPicks, PreviewRequest } from "./requests.ts";

/** The level-up wizard's preview of the levels a character plans, from its rows: its steps, and each level's details. */
export default class LevelUpPreview extends PlannedLevelsState {
  /**
   * The level-up wizard's preview of the planned levels: its feats and spells steps, each level's class, hit die and
   * hit points (a character's first level's, its die's highest), and where each pool's next pick goes. The feats and
   * spells steps fit the form's feats and spells (`picks`) to their pools, as a save would take them, and say what fits
   * (`fitted`), each pool's room for them, and what the levels grant: their class levels' grants, and what the
   * character holds with them and the fitted picks that a modifier gave it, which it didn't hold as saved.
   */
  private buildLevelUpPreview(planned: PlannedLevels, picks: Partial<LevelPicks>) {
    const { classLevelEntries, savedLevelCount } = planned;
    const gains = this.computeLevelGains(planned);
    const { classLevelIds } = gains;
    const fitted = this.fitPicks(picks, (poolPicks) => this.buildWithPicks(planned, poolPicks, gains));
    const pools = fitted.character.components.aptitudes.getLevelUpPools(this.dnd52, this.countOwnPicks(fitted.picks));
    const given = this.givenWith(planned.saved, fitted.character);
    return {
      feats: { ...this.featStep(pools, this.grantingLevelsOf(planned), given.feats), fitted: fitted.picks.feats },
      spells: { ...this.spellStep(pools, classLevelIds, given.spells), fitted: fitted.picks.spells },
      // Per-level data for HP step, review, and auto-assignment
      levelDetails: classLevelEntries.map(({ klass, classLevel }, i) => ({
        classId: klass.id,
        className: klass.name,
        classLevelId: classLevel.id,
        level: classLevel.position,
        hd: klass.fields[CLASS_HD],
        hitPoints: this.levelHitPointsOf(klass, savedLevelCount + i === 0),
      })),
      nextPickLevels: this.nextPickLevelsOf(gains, fitted.picks),
    };
  }

  /**
   * The planned level each pool's next pick goes on (`PicksDistribution.nextLevelOf`), after the picks it has
   * (`picks`): a feat pool's, and a spell pool's at each spell level and at any (`""`), whichever the wizard opens.
   */
  private nextPickLevelsOf({ perLevelFeatSlots, perLevelSpellSlots }: LevelGains, picks: PoolPicks) {
    const own = this.countOwnPicks(picks);
    const feats = Object.entries(perLevelFeatSlots).map(([aptitudeId, slots]) => [
      aptitudeId,
      PicksDistribution.nextLevelOf(slots, own.feats[aptitudeId] ?? 0),
    ]);
    const spells = Object.entries(perLevelSpellSlots).map(([aptitudeId, slotsPerLevel]) => {
      const counts = own.spells[aptitudeId] ?? {};
      const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
      const levels: Record<string, number> = {
        "": PicksDistribution.nextLevelOf(
          slotsPerLevel.map((slots) => Object.values(slots).reduce((sum, count) => sum + count, 0)),
          total,
        ),
      };
      for (let spellLevel = 0; spellLevel <= MAX_SPELL_LEVEL; spellLevel++) {
        const key = String(spellLevel);
        levels[key] = PicksDistribution.nextLevelOf(
          slotsPerLevel.map((slots) => slots[key] ?? 0),
          counts[key] ?? 0,
        );
      }
      return [aptitudeId, levels];
    });
    return {
      feats: Object.fromEntries(feats) as Record<string, number>,
      spells: Object.fromEntries(spells) as Record<string, Record<string, number>>,
    };
  }

  /**
   * The level-up wizard's preview of the levels the character plans (`levels`), and of the picks made over them so far
   * (`picks`: the feats and spells picked, by pool).
   */
  describePreview({ levels, picks = {} }: PreviewRequest) {
    return this.buildLevelUpPreview(this.buildPlannedLevels(this.getPlannedClassLevels(levels)), picks);
  }
}
