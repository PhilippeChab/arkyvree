import type { LevelAbilityIncrease } from "@/shared/relations.ts";

import LevelPicksRepository from "./LevelPicksRepository.ts";

/** A level's ability increases: each an ability its level raises, and by how much. */
class CharacterLevelAbilityIncreasesRepository extends LevelPicksRepository<LevelAbilityIncrease> {
  protected override readonly pick = "abilityIncreases";
}

export default CharacterLevelAbilityIncreasesRepository;
