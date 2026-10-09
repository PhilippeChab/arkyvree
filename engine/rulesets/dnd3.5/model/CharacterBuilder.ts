import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { BondedKind } from "@/shared/dnd3.5/bondedKinds.ts";
import type { Character as CharacterRecord } from "@/shared/relations.ts";

import DetailedCharacterAnimalCompanion from "./bonded/DetailedCharacterAnimalCompanion.ts";
import DetailedCharacterFamiliar from "./bonded/DetailedCharacterFamiliar.ts";
import DetailedCharacterMount from "./bonded/DetailedCharacterMount.ts";
import DetailedCharacter from "./DetailedCharacter.ts";
import type { ProjectedCharacterData } from "./projection.ts";

/** What a 3.5 character is: a player character, or a creature bonded to one. */
export type CharacterKind = "pc" | BondedKind;

/** The 3.5 character a row is, by its kind: a bonded creature's class, or a player character's for any other kind. */
function createCharacter(record: CharacterRecord, kind: CharacterKind): DetailedCharacter {
  switch (kind) {
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

/** A 3.5 character built from the rows the server read, of its row's kind. */
export default class CharacterBuilder {
  /**
   * A character, built from the rows the server read (`input`) in its ruleset's `view`, of its row's kind: with a
   * level-up's `projected` levels and picks, and a bonded creature's sheet derived from its master's, built from its
   * input's unless it comes built (`master`: a sheet's, which its creatures share).
   */
  static build(
    view: RulesetView,
    input: CharacterInput,
    { master, projected }: { master?: DetailedCharacter; projected?: ProjectedCharacterData } = {},
  ): DetailedCharacter {
    const character = createCharacter(input.record, input.record.kind as CharacterKind);
    character.build(
      input.rows,
      view,
      projected,
      master ?? (input.master && CharacterBuilder.build(view, input.master)),
    );
    return character;
  }
}
