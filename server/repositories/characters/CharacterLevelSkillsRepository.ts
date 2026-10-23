import type { LevelSkill } from "@/shared/relations.ts";

import LevelPicksRepository from "./LevelPicksRepository.ts";

/** A level's skill ranks: each skill it put ranks in, and how many. */
class CharacterLevelSkillsRepository extends LevelPicksRepository<LevelSkill> {
  protected override readonly pick = "skills";
}

export default CharacterLevelSkillsRepository;
