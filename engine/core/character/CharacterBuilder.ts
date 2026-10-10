import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { Character } from "@/shared/relations.ts";

import type CharacterBase from "./CharacterBase.ts";
import type { LoadedCharacter } from "./CharacterDataLoader.ts";

/** What builds a ruleset's characters: a character from its rows, in its ruleset's view. */
export interface BuildsCharacters<C> {
  build(view: RulesetView, input: CharacterInput): C;
}

/**
 * A ruleset's characters (`C`, on core's `CharacterBase`) built from the rows the server read, each of its row's kind
 * (`create`: a player character, a creature bonded to one), a bonded creature's master built first.
 */
export default abstract class CharacterBuilder<
  // Its ruleset's character, whatever its components (`object`: `CharacterBase` checks each is one of its data)
  C extends CharacterBase<object, LoadedCharacter>,
> implements BuildsCharacters<C> {
  /** The ruleset's character a row is, by its kind. */
  protected abstract create(record: Character): C;

  /**
   * A character, built from its rows (`input`: as the server read them, or with what a level-up adds,
   * `CharacterProjection`) in its ruleset's `view`, of its row's kind: a bonded creature's sheet derived from its
   * master's, built from its input's unless it comes built (`master`: a sheet's, which its creatures share).
   */
  build(view: RulesetView, input: CharacterInput, { master }: { master?: C } = {}): C {
    const character = this.create(input.record);
    character.build(input.rows, view, master ?? (input.master && this.build(view, input.master)));
    return character;
  }
}
