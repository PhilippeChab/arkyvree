/**
 * The engine's one entry: what the server (and the seeders and the codegen) ask of a ruleset's rules, each an operation
 * on the data the caller read, answering data. Which ruleset answers is the engine's to know, from the ruleset the
 * caller hands it: nothing outside the engine imports anything else of it.
 */

export { describeBondedCreature, describeCharacter, describePartialCharacter } from "./api/characters.ts";
export type { CharacterInput, CharacterRows } from "./core/module/index.ts";
export type { RulesetView } from "./core/types.ts";
