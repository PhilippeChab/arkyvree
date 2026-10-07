import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/types.ts";
import Dnd35DetailedCharacterAnimalCompanion from "@/engine/rulesets/dnd3.5/bonded/DetailedCharacterAnimalCompanion.ts";
import Dnd35DetailedCharacterFamiliar from "@/engine/rulesets/dnd3.5/bonded/DetailedCharacterFamiliar.ts";
import Dnd35DetailedCharacterMount from "@/engine/rulesets/dnd3.5/bonded/DetailedCharacterMount.ts";
import type { CharacterKind, Dnd35ProjectedCharacterData } from "@/engine/rulesets/dnd3.5/types.ts";
import type { Character as CharacterRecord } from "@/shared/relations.ts";

import DetailedCharacter from "./DetailedCharacter.ts";

/**
 * A character, built from the rows the server read (`input`) in its ruleset's `view`, of its row's kind: with a
 * level-up's `projected` levels and picks, and a bonded creature's sheet derived from its master's, built from its
 * input's unless it comes built (`master`: a sheet's, which its creatures share).
 */
export function buildCharacter(
  view: RulesetView,
  input: CharacterInput,
  { master, projected }: { master?: DetailedCharacter; projected?: Dnd35ProjectedCharacterData } = {},
): DetailedCharacter {
  const character = createCharacter(input.record, input.record.kind as CharacterKind);
  character.build(input.rows, view, projected, master ?? (input.master && buildCharacter(view, input.master)));
  return character;
}

/** The 3.5 character a row is, by its kind: a bonded creature's class, or a player character's for any other kind. */
export function createCharacter(record: CharacterRecord, kind: CharacterKind = "pc"): DetailedCharacter {
  switch (kind) {
    case "familiar":
      return new Dnd35DetailedCharacterFamiliar(record);
    case "animalcompanion":
      return new Dnd35DetailedCharacterAnimalCompanion(record);
    case "mount":
      return new Dnd35DetailedCharacterMount(record);
    default:
      return new DetailedCharacter(record);
  }
}
