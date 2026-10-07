import { checkEquipping } from "@/engine/rulesets/dnd3.5/items/equipping.ts";
import { describeCharacter, describePartialCharacter } from "@/engine/rulesets/dnd3.5/response/describeCharacter.ts";

/** The 3.5 characters, as the module answers the server of them: their sheets, and what equipping an item checks. */
export class Dnd35Characters {
  readonly checkEquipping = checkEquipping;

  readonly describeCharacter = describeCharacter;

  readonly describePartialCharacter = describePartialCharacter;
}
