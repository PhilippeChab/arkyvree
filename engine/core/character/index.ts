/** A character, as every ruleset builds and validates it: the bases a ruleset's character extends. */

export { default as CharacterBase } from "./CharacterBase.ts";
export { type BuildsCharacters, default as CharacterBuilder } from "./CharacterBuilder.ts";
export { type BuiltCharacter, default as CharacterComponent } from "./CharacterComponent.ts";
export {
  default as CharacterDataLoader,
  type InventoryEntry,
  type LoadedCharacter,
  type ModifierSource,
} from "./CharacterDataLoader.ts";
export { Validates, type ValidationResult } from "./concerns/Validates.ts";
