import type { LevelPower } from "@/shared/relations.ts";

import LevelPicksRepository from "./LevelPicksRepository.ts";

/** A level's spells: each picked from a list. */
class CharacterLevelPowersRepository extends LevelPicksRepository<LevelPower> {
  protected override readonly pick = "powers";
}

export default CharacterLevelPowersRepository;
