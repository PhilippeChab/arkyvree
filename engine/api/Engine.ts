import type { RulesetView } from "@/engine/core/view/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import ContentEngine from "./ContentEngine.ts";
import CopyOnWriteEngine from "./CopyOnWriteEngine.ts";
import Modules from "./Modules.ts";
import RulesetEngine from "./RulesetEngine.ts";

/**
 * The engine's entry: what code outside it asks the rules, as the client asks the server through its API. A ruleset's
 * rules answer through a handle bound to its view (`Engine.for(scope)`), and through it to what they're about
 * (`.character(input)`, `.class(klassId)`, `.skills()`); a base rules' content before any view (`forRules`); and
 * copy-on-write, which builds the view (`copyOnWrite`). Which ruleset answers is the engine's to know.
 */
export default class Engine {
  /** The copy-on-write the cache builds a ruleset's view with, and its writes copy an entity by. */
  static copyOnWrite() {
    return new CopyOnWriteEngine();
  }

  /** The engine bound to a ruleset's view: its rules, by what they're about. */
  static for(view: RulesetView) {
    return new RulesetEngine(view);
  }

  /** The engine bound to a base rules' content, which the seeders and the codegen ask before any ruleset has a view. */
  static forRules(baseRules: BaseRules) {
    return new ContentEngine(Modules.of(baseRules));
  }
}
