/** A character, as every ruleset builds and validates it: the bases a ruleset's character extends. */

export { default as CharacterBase, type DataLoader, type LoadedCharacter } from "./CharacterBase.ts";
export { type BuiltFromRows, default as CharacterBuilder } from "./CharacterBuilder.ts";
export { Validates, type ValidationResult } from "./concerns/Validates.ts";
