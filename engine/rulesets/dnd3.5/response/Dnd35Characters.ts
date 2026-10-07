import { describeBondedCreature, describeCharacter, describePartialCharacter } from "./describeCharacter.ts";

/** The 3.5 characters, as the module describes them to the server: a sheet as the API answers it. */
export class Dnd35Characters {
  readonly describeBondedCreature = describeBondedCreature;

  readonly describeCharacter = describeCharacter;

  readonly describePartialCharacter = describePartialCharacter;
}
