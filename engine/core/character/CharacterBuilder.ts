import type { CharacterInput, CharacterRows } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { Character } from "@/shared/relations.ts";

/** What builds a ruleset's characters: a character from its rows, in its ruleset's view. */
export interface BuildsCharacters<C> {
  build(view: RulesetView, input: CharacterInput): C;
}

/** A character a builder builds: from its rows, in its ruleset's view, given its master built when it has one. */
export interface BuiltFromRows<C> {
  build(rows: CharacterRows, view: RulesetView, master?: C): void;
}

/**
 * A ruleset's characters built from the rows the server read, each of its row's kind (`create`: a player character, a
 * creature bonded to one), a bonded creature's master built first.
 */
export default abstract class CharacterBuilder<C extends BuiltFromRows<C>> implements BuildsCharacters<C> {
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
