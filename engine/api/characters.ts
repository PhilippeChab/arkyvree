import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/types.ts";

import { getRulesetModule } from "./modules.ts";

/** The ruleset's characters: what its module describes them as. */
function charactersOf(view: RulesetView) {
  return getRulesetModule(view.ruleset.baseRules).characters;
}

/** A bonded creature's sheet, as the API answers it, from its rows and its master's. */
export function describeBondedCreature(view: RulesetView, creature: CharacterInput, master: CharacterInput) {
  return charactersOf(view).describeBondedCreature(view, creature, master);
}

/**
 * A player character's sheet, as the API answers it, with its bonded creatures' (`bonded`), from their rows: their
 * private notes as the viewer reads them (`privateNotes`: all of them, blank, or no field).
 */
export function describeCharacter(
  view: RulesetView,
  character: CharacterInput,
  bonded: CharacterInput[],
  privateNotes?: Parameters<ReturnType<typeof charactersOf>["describeCharacter"]>[3],
) {
  return charactersOf(view).describeCharacter(view, character, bonded, privateNotes);
}

/** What a campaign member who sees a character only partly reads of it: who it is, and its identity. */
export function describePartialCharacter(view: RulesetView, character: CharacterInput) {
  return charactersOf(view).describePartialCharacter(view, character);
}
