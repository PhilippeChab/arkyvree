import { checkEquipping } from "@/engine/rulesets/dnd3.5/items/equipping.ts";
import { openRacePicker } from "@/engine/rulesets/dnd3.5/races/racePicker.ts";
import { describeCharacter, describePartialCharacter } from "@/engine/rulesets/dnd3.5/response/describeCharacter.ts";
import { describeCharacterSheet } from "@/engine/rulesets/dnd3.5/sheet/describeCharacterSheet.tsx";

/**
 * The 3.5 characters, as the module answers the server of them: their sheets, as the API answers them and printed,
 * what equipping an item checks, and the races a new one can pick.
 */
export class Dnd35Characters {
  readonly checkEquipping = checkEquipping;

  readonly describeCharacter = describeCharacter;

  readonly describeCharacterSheet = describeCharacterSheet;

  readonly describePartialCharacter = describePartialCharacter;

  readonly openRacePicker = openRacePicker;
}
