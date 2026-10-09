import type { RulesetView } from "@/engine/core/types.ts";
import Equipping from "@/engine/rulesets/dnd3.5/items/Equipping.ts";
import RacePicker from "@/engine/rulesets/dnd3.5/races/RacePicker.ts";
import CharacterDescription from "@/engine/rulesets/dnd3.5/response/CharacterDescription.ts";
import CharacterSheet from "@/engine/rulesets/dnd3.5/sheet/CharacterSheet.tsx";

/**
 * The 3.5 characters, as the module answers the server of them: their sheets, as the API answers them and printed,
 * what equipping an item checks, and the races a new one can pick.
 */
export class Dnd35Characters {
  /** Refuses equipping an item where the character can't hold it: a slot taken, a hand short, a requirement unmet. */
  checkEquipping(...args: Parameters<typeof Equipping.check>) {
    Equipping.check(...args);
  }

  /** A character's sheet as the API answers it, with its bonded creatures', or a creature's. */
  describeCharacter(...args: Parameters<typeof CharacterDescription.describe>) {
    return CharacterDescription.describe(...args);
  }

  /** A character's printed sheet: the PDF document the server renders. */
  describeCharacterSheet(...args: Parameters<typeof CharacterSheet.describe>) {
    return CharacterSheet.describe(...args);
  }

  /** The part of a character's sheet another player sees. */
  describePartialCharacter(...args: Parameters<typeof CharacterDescription.describePartial>) {
    return CharacterDescription.describePartial(...args);
  }

  /** The race picker of a new character: the races it offers, and whether each is eligible. */
  openRacePicker(view: RulesetView, identity: { alignment?: string; gender?: string }) {
    return RacePicker.open(view, identity);
  }
}
