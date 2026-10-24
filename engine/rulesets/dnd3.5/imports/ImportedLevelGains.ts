import CharacterProjection from "@/engine/rulesets/dnd3.5/levelUp/CharacterProjection.ts";
import type { PlannedClassLevel } from "@/engine/rulesets/dnd3.5/levelUp/LevelUpBase.ts";
import PicksDistribution from "@/engine/rulesets/dnd3.5/levelUp/PicksDistribution.ts";
import PlannedLevelsState from "@/engine/rulesets/dnd3.5/levelUp/PlannedLevelsState.ts";
import type { FeatPick } from "@/engine/rulesets/dnd3.5/levelUp/plans.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";

/**
 * What an imported level gives, read as a level-up of that level alone reads it (`PlannedLevelsState`), over the
 * character's rows with the levels imported before it: the room each feat pool and each spell list has with it, its
 * skill points, the
 * skills its class makes class skills, and each skill's ranks so far and whether it's a class skill of the character's.
 */
export interface LevelGains {
  classSkillIds: Set<string>;
  /** Each feat pool's room with the level, by aptitude id: what its slots (and the levels before it left) open */
  featRoom: Map<string, number>;
  /** Each spell list's room with the level, by aptitude id, then by spell level: the spells its class learns there */
  powerRoom: Map<string, Map<number, number>>;
  skillPoints: number;
  skills: ReturnType<typeof PicksDistribution.contextsOf>;
}

/**
 * An imported level's place among the character's levels: what it gives (`describeGains`), and the character with it
 * and the feats placed on it so far (`buildWith`), whose requirements and pools the next feat is read against.
 */
export default class ImportedLevelGains extends PlannedLevelsState {
  /**
   * The character with the level (`entry`), its skill points (`skills`, by skill id) and these feats (`feats`, each in
   * its pool) picked at it: a feat whose requirement the level's ranks meet is taken there, as a level-up takes it.
   */
  buildWith(entry: PlannedClassLevel, skills: Record<string, number>, feats: FeatPick[]): DetailedCharacter {
    const projection = new CharacterProjection(this.character);
    const { abilityIncreases, klassLevel } = entry;
    const ranks = Object.entries(skills).map(([skillId, rank]) => ({ rank, skillId }));
    projection.pick(projection.addLevel(klassLevel.id, { abilityIncreases, hp: LevelRules.UNROLLED_LEVEL_HP }), {
      feats,
      skills: ranks,
    });
    return this.build(projection);
  }

  /** What the level (`entry`) gives, after the character's levels: its pools' room, its skill points and class skills. */
  describeGains(entry: PlannedClassLevel): LevelGains {
    const planned = this.buildPlannedLevels([entry]);
    const gains = this.computeLevelGains(planned);
    const skills = planned.character.components.skills.getEnrichedSkills(
      Dnd35View.of(this.rulesetData).skills,
      gains.classSkills.merged,
    );
    const featRoom = new Map(Object.values(gains.pools.featPools).map((pool) => [pool.id, pool.available]));
    const powerRoom = new Map(
      Object.values(gains.pools.powerPools).map((pool) => [
        pool.id,
        new Map(
          Object.entries(pool.levels ?? {}).map(([spellLevel, { available }]) => [Number(spellLevel), available]),
        ),
      ]),
    );
    return {
      classSkillIds: new Set(gains.classSkills.perLevel[0]),
      featRoom,
      powerRoom,
      skillPoints: gains.perLevelSkillPoints[0] ?? 0,
      skills: PicksDistribution.contextsOf(skills),
    };
  }
}
