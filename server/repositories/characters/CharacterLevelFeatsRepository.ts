import type { LevelFeat } from "@/shared/relations.ts";

import LevelPicksRepository from "./LevelPicksRepository.ts";

/** A level's feats: each picked from a pool. */
class CharacterLevelFeatsRepository extends LevelPicksRepository<LevelFeat> {
  protected override readonly pick = "feats";
}

export default CharacterLevelFeatsRepository;
