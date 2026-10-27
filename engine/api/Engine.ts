import { CharactersPart, type StoredAdvancement } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { BaseRules } from "@/shared/enums.ts";
import type { Character } from "@/shared/relations.ts";

import ContentEngine from "./ContentEngine.ts";
import CopyOnWriteEngine from "./CopyOnWriteEngine.ts";
import ImportsEngine from "./ImportsEngine.ts";
import Modules from "./Modules.ts";
import RulesEngine from "./RulesEngine.ts";
import RulesetEngine from "./RulesetEngine.ts";
import StorageEngine from "./StorageEngine.ts";

/**
 * The engine's entry: what code outside it asks the rules, as the client asks the server through its API. A ruleset's
 * rules answer through a handle bound to its view (`Engine.for(scope)`), and through it to what they're about
 * (`.character(input)`, `.entities(type)`, `.skills()`); a base rules' content before any view (`forRules`); what
 * every base rules' rulesets share (`rules`); a list's card, its ruleset read or not (`describeCard`); and
 * copy-on-write, which builds the view (`copyOnWrite`). Which ruleset answers is the engine's to know.
 */
export default class Engine {
  /** The copy-on-write the cache builds a ruleset's view with, and its writes copy an entity by. */
  static copyOnWrite() {
    return new CopyOnWriteEngine();
  }

  /**
   * A character's card (`character`, with its advancements, `advancements`), as a list shows it, partly seen or not
   * (`partial`): as its ruleset's view (`view`) describes it (`characters().describeCard`), or the core's for a
   * character whose ruleset the list didn't read (an archived ruleset's, no `view`), which no ruleset describes.
   */
  static describeCard(
    view: RulesetView | undefined,
    character: Character,
    advancements: StoredAdvancement[],
    partial: boolean,
  ) {
    return view
      ? Engine.for(view).characters().describeCard(character, advancements, partial)
      : CharactersPart.describeUnreadCard(character, partial);
  }

  /** The engine bound to a ruleset's view: its rules, by what they're about. */
  static for(view: RulesetView) {
    return new RulesetEngine(view);
  }

  /**
   * The engine bound to a base rules' content, which the seeders and the codegen ask before any ruleset has a view: its
   * own module's, by the base rules it's handed.
   */
  static forRules<B extends BaseRules>(baseRules: B) {
    return new ContentEngine(Modules.of(baseRules).content);
  }

  /**
   * The engine asked of imports before a ruleset is picked: what a character file another program saved is, and which
   * base rules' rulesets import it.
   */
  static imports() {
    return new ImportsEngine(Modules.all());
  }

  /**
   * The engine asked of what every base rules' rulesets share, before any ruleset: their words, kinds and license, and
   * the kinds a fork restores.
   */
  static rules() {
    return RulesEngine.shared();
  }

  /** How every module stores its data in the generic tables, which the server reads and writes them by. */
  static storage() {
    return StorageEngine.shared();
  }
}
