import type { PlannedClassLevel } from "@/engine/core/levelUp/index.ts";
import { CharacterProjection, type FeatPick } from "@/engine/core/module/index.ts";
import Dnd35PicksDistribution from "@/engine/rulesets/dnd3.5/levelUp/Dnd35PicksDistribution.ts";
import PlannedLevelsState from "@/engine/rulesets/dnd3.5/levelUp/PlannedLevelsState.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";

/**
 * What an imported level gives, read as a level-up of that level alone reads it (`PlannedLevelsState`), over the
 * character's rows with the levels imported before it: the room each feat pool has with it, its skill points, the
 * skills its class makes class skills, and each skill's ranks so far and whether it's a class skill of the character's.
 */
export interface LevelGains {
  classSkillIds: Set<string>;
  /** Each feat pool's room with the level, by aptitude id: what its slots (and the levels before it left) open */
  featRoom: Map<string, number>;
  skillPoints: number;
  skills: ReturnType<typeof Dnd35PicksDistribution.contextsOf>;
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
      this.rulesetData.skills,
      gains.classSkills.merged,
    );
    const featRoom = new Map(Object.values(gains.pools.featPools).map((pool) => [pool.id, pool.available]));
    return {
      classSkillIds: new Set(gains.classSkills.perLevel[0]),
      featRoom,
      skillPoints: gains.perLevelSkillPoints[0] ?? 0,
      skills: Dnd35PicksDistribution.contextsOf(skills),
    };
  }
}
