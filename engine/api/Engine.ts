import { CharactersPart, type StoredAdvancement } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { BaseRules } from "@/shared/enums.ts";
import type { Character } from "@/shared/relations.ts";

import BaseRulesEngine from "./BaseRulesEngine.ts";
import ImportsEngine from "./ImportsEngine.ts";
import Modules from "./Modules.ts";
import RulesEngine from "./RulesEngine.ts";
import RulesetEngine from "./RulesetEngine.ts";
import StorageEngine from "./StorageEngine.ts";

/**
 * The engine's entry: what code outside it asks the rules, as the client asks the server through its API. A ruleset's
 * rules answer through a handle bound to its view (`Engine.for(scope)`), and through it to what they're about
 * (`.character(input)`, `.entities(type)`); a base rules' before any view (`forRules`: its content, how it
 * stores its data, and copy-on-write, which builds the view); what every base rules' rulesets share (`rules`,
 * `storages`); and a list's card, its ruleset read or not (`describeCard`). Which ruleset answers is the engine's to
 * know.
 */
export default class Engine {
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
   * The engine bound to a base rules, before any of its rulesets has a view: their copy-on-write (`copyOnWrite()`), how
   * its module stores their data (`storage()`), and its content, which the seeders and the codegen ask.
   */
  static forRules<B extends BaseRules>(baseRules: B) {
    return new BaseRulesEngine(baseRules);
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

  /** How every module stores its data: each base rules' storage, whose declarations the registries hold. */
  static storages() {
    return StorageEngine.all();
  }
}
