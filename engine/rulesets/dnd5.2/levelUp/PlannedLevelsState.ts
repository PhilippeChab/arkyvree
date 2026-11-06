import { z } from "zod";

import RulesError from "@/engine/core/RulesError.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd5.2/limits.ts";
import AptitudeTargets from "@/engine/rulesets/dnd5.2/model/aptitudes/AptitudeTargets.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd5.2/model/DetailedCharacter.ts";
import LevelRules from "@/engine/rulesets/dnd5.2/rules/LevelRules.ts";
import { include } from "@/lib/mixins.ts";
import { PLAYER_CHARACTER_KIND } from "@/vocabulary/dnd5.2/characterKinds.ts";

import CharacterProjection from "./CharacterProjection.ts";
import { PlansAptitudeSlots } from "./concerns/PlansAptitudeSlots.ts";
import type { PlannedClassLevel } from "./LevelUpBase.ts";
import LevelUpState, { type GrantingLevel, type PoolPicks } from "./LevelUpState.ts";
import PicksDistribution, { type FeatSlots } from "./PicksDistribution.ts";
import type { LevelPicks, LevelRequest } from "./requests.ts";

/**
 * A level-up's planned levels, built: the character with them (`character`, built with their projection), the
 * character as saved, without them (`saved`), what their class levels grant, and how many levels it has before them.
 */
export interface PlannedLevels {
  character: DetailedCharacter;
  classLevelEntries: PlannedClassLevel[];
  /**
   * Each planned level's granted feats the view shows: its class level's `grants` links' feats, and its starting
   * proficiencies at a class's first level
   */
  grantedFeatRecords: { toId: string }[][];
  saved: DetailedCharacter;
  savedLevelCount: number;
}

/** What the planned levels give: the pools the character picks in, and each level's slots. */
export type LevelGains = ReturnType<PlannedLevelsState["computeLevelGains"]>;

/** A level-up's planned level, within the rules' bounds: no class past its last level. */
const PLANNED_LEVEL = z.object({ level: z.number().max(RULESET_LIMITS.classLevel) });

/**
 * The levels a character plans in a level-up, from its rows: each checked to be the ruleset's, the character built with
 * them, and what they give, the same for the wizard's preview (`LevelUpPreview`) and the save (`LevelUpPlan`): the
 * pools the character picks in, and each level's pool slots (`PlansAptitudeSlots`).
 */
export default abstract class PlannedLevelsState extends include(LevelUpState, PlansAptitudeSlots) {
  /**
   * The feat that gives each pool room past its slots, a pool a feat's modifier creates (`aptitudes.<slug>….allowed`)
   * too: the first-pass feat (one picked in a pool with slots) that targets it.
   */
  private getAptitudeSources(feats: Record<string, string[]>, perLevelFeatSlots: FeatSlots) {
    const hasSlots = (aptId: string) => (perLevelFeatSlots[aptId] ?? []).some((s) => s > 0);
    const sources = new Map<string, string>();
    const firstPassFeatIds = Object.entries(feats)
      .filter(([aptId]) => hasSlots(aptId))
      .flatMap(([, ids]) => ids);
    for (const featId of firstPassFeatIds) {
      for (const mod of this.rulesetData.modifiersBySource.get(featId) ?? []) {
        const list = AptitudeTargets.parseAllowed(mod.target);
        const aptId = list === undefined ? undefined : this.dnd52.aptitudeIdBySlug.get(list);
        if (aptId && Object.hasOwn(feats, aptId)) sources.set(aptId, mod.sourceId);
      }
    }
    return sources;
  }

  /**
   * The planned levels (`classLevelEntries`), built from the character's rows: the character with them, and as saved,
   * and the feats each grants, its class's starting proficiencies at its first level (a first class's at the
   * character's first, a multiclass's otherwise).
   */
  protected buildPlannedLevels(classLevelEntries: PlannedClassLevel[]): PlannedLevels {
    const projection = new CharacterProjection(this.character);
    for (const { classLevel } of classLevelEntries)
      projection.addLevel(classLevel.id, { hp: LevelRules.UNROLLED_LEVEL_HP });
    const savedLevelCount = this.character.rows.advancements.length;
    return {
      grantedFeatRecords: classLevelEntries.map(({ classLevel }, i) =>
        this.grantedFeatsAt(classLevel.id, savedLevelCount + i === 0).map(({ id }) => ({ toId: id })),
      ),
      character: this.build(projection),
      savedLevelCount,
      classLevelEntries,
      saved: this.build(),
    };
  }

  /**
   * The character with the planned levels (`planned`) and the picks spread over them as a save spreads them (`gains`:
   * what the levels give), which the preview fits the wizard's picks with.
   */
  protected buildWithPicks(planned: PlannedLevels, picks: PoolPicks, gains: LevelGains) {
    const distributed = this.distributePlannedPicks(planned, picks, gains);
    const projection = new CharacterProjection(this.character);
    for (const [i, { classLevel }] of planned.classLevelEntries.entries()) {
      const level = projection.addLevel(classLevel.id, { hp: LevelRules.UNROLLED_LEVEL_HP });
      projection.pick(level, this.toPickPlans(distributed[i]));
    }
    return this.build(projection);
  }

  /**
   * What the planned levels give, the same for the preview and the save: the pools the character picks in, and each
   * level's pool slots.
   */
  protected computeLevelGains(planned: PlannedLevels) {
    const { grantedFeatRecords, character, classLevelEntries, saved } = planned;
    const classLevelIds = classLevelEntries.map(({ classLevel }) => classLevel.id);
    const pools = character.components.aptitudes.getLevelUpPools(this.dnd52);
    const slots = this.planAptitudeSlots(
      classLevelIds,
      grantedFeatRecords,
      Object.keys(pools.featPools),
      Object.keys(pools.spellPools),
      saved.components.aptitudes.getAptitudes(),
    );
    return { ...slots, classLevelIds, pools };
  }

  /**
   * A save's pooled picks (feats and spells by pool) spread over its planned levels, each level taking what its slots
   * allow, in order (a leveled pool's spells by the highest level its room has by then, the saved character's
   * included), and what's past a pool's slots on the level of the feat that gives it room, or the last
   * (`PicksDistribution`). `gains`: what the levels give, when the caller has them.
   */
  protected distributePlannedPicks(planned: PlannedLevels, picks: LevelPicks, gains = this.computeLevelGains(planned)) {
    const { perLevelFeatSlots, perLevelSpellSlots } = gains;
    const { aptitudes } = planned.saved.components;
    const highestRoomLevels = Object.fromEntries(
      Object.keys(picks.spells).map((aptitudeId) => [aptitudeId, aptitudes.getHighestRoomLevel(aptitudeId)]),
    );
    const levelCount = planned.classLevelEntries.length;
    const data = { highestRoomLevels, levelCount, perLevelFeatSlots, perLevelSpellSlots };
    return new PicksDistribution(data).distribute(
      picks,
      this.buildSpellLevelLookup(Object.values(picks.spells).flat()),
      this.getAptitudeSources(picks.feats, perLevelFeatSlots),
    );
  }

  /** The planned levels whose grants a step lists: each its class level, and whether it's the character's first. */
  protected grantingLevelsOf({ classLevelEntries, savedLevelCount }: PlannedLevels): GrantingLevel[] {
    return classLevelEntries.map(({ classLevel }, i) => ({
      classLevelId: classLevel.id,
      first: savedLevelCount + i === 0,
    }));
  }

  /**
   * Each planned level's class and class level, from the composed ruleset: a class the view has is of the character's
   * ruleset or its source chain. Refused past the rules' bounds (a class's last level, and a character's, counting the
   * levels it has), and when a class isn't the view's or a player character's, or hasn't that level.
   */
  getPlannedClassLevels(levels: Omit<LevelRequest, "hp">[]): PlannedClassLevel[] {
    // No character past its last level: the planned levels come after those it has
    const levelsLeft = LevelRules.countLevelsLeft(this.character.rows.advancements.length);
    const message = `A character can't go past level ${RULESET_LIMITS.characterLevel}: ${levelsLeft} level(s) left`;
    RulesError.parse(z.array(PLANNED_LEVEL).max(levelsLeft, message), levels, ["levels"]);
    return levels.map(({ classId, level }, i) => {
      // A refusal names the character's level it's about, and a class in its rules' word
      const about = `Level ${i + 1}: `;
      const word = this.rulesetData.labelOf("classes");
      const klass = this.dnd52.classesById.get(classId);
      if (!klass) throw new RulesError("invalid", `${about}${word} does not belong to the character's ruleset`);

      if (klass.partition !== PLAYER_CHARACTER_KIND)
        throw new RulesError("invalid", `${about}${word} is not valid for a player character`);

      const classLevel = this.dnd52.classLevelByClassAndLevel.get(`${classId}:${level}`);
      if (!classLevel) throw this.rulesetData.notFound("class-levels", { about });

      return { klass, classLevel };
    });
  }
}
