import { CharacterBuilder } from "@/engine/core/character/index.ts";
import type { BondedKind } from "@/shared/dnd3.5/bondedKinds.ts";
import type { Character as CharacterRecord } from "@/shared/relations.ts";

import DetailedCharacterAnimalCompanion from "./bonded/DetailedCharacterAnimalCompanion.ts";
import DetailedCharacterFamiliar from "./bonded/DetailedCharacterFamiliar.ts";
import DetailedCharacterMount from "./bonded/DetailedCharacterMount.ts";
import DetailedCharacter from "./DetailedCharacter.ts";

/** What a 3.5 character is: a player character, or a creature bonded to one. */
export type CharacterKind = "pc" | BondedKind;

/** The 3.5 characters built from the rows the server read, on core's builder: each of its row's kind. */
class Dnd35CharacterBuilder extends CharacterBuilder<DetailedCharacter> {
  /** The 3.5 character a row is, by its kind: a bonded creature's class, or a player character's for any other kind. */
  protected create(record: CharacterRecord): DetailedCharacter {
    switch (record.kind as CharacterKind) {
      case "familiar":
        return new DetailedCharacterFamiliar(record);
      case "animalcompanion":
        return new DetailedCharacterAnimalCompanion(record);
      case "mount":
        return new DetailedCharacterMount(record);
      default:
        return new DetailedCharacter(record);
    }
  }
}

export default new Dnd35CharacterBuilder();
