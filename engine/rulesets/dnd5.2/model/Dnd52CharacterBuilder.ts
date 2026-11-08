import { CharacterBuilder } from "@/engine/core/character/index.ts";
import type { Character as CharacterRecord } from "@/shared/relations.ts";

import DetailedCharacter from "./DetailedCharacter.ts";

/**
 * The D&D 5th Edition characters built from the rows the server read, on core's builder: a player character, whatever
 * its row's kind, as the SRD 5.2.1 has no class that levels a companion.
 */
class Dnd52CharacterBuilder extends CharacterBuilder<DetailedCharacter> {
  protected override create(record: CharacterRecord): DetailedCharacter {
    return new DetailedCharacter(record);
  }
}

export default new Dnd52CharacterBuilder();
