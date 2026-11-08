import type { BaseRules } from "@/shared/enums.ts";

import CopyOnWriteEngine from "./CopyOnWriteEngine.ts";
import Modules, { type ModuleOf } from "./Modules.ts";
import StorageEngine from "./StorageEngine.ts";

/**
 * The engine bound to a base rules (`baseRules`), before any of its rulesets has a view: their copy-on-write
 * (`copyOnWrite`), how its module stores their data (`storage`), and its content, which the seeders and the codegen ask
 * by that module's own shapes.
 */
export default class BaseRulesEngine<B extends BaseRules> {
  constructor(private readonly baseRules: B) {}

  /** The copy-on-write of its rulesets: what the cache builds a view with, and its writes copy an entity by. */
  copyOnWrite() {
    return new CopyOnWriteEngine(this.baseRules);
  }

  /**
   * What an entity of a kind brings with it (a skill's feats), as the engine makes them for one a ruleset adds: what the
   * seeders write for a book's own.
   */
  describeBroughtEntities(kind: string, name: string) {
    return Modules.of(this.baseRules).content.describeBroughtEntities(kind, name);
  }

  /**
   * A class's progressions' values at each level, by how good each is: what the seeders store a class's levels by, and
   * the codegen classifies a book's class table by.
   */
  describeLevelPresets() {
    return Modules.of(this.baseRules).content.describeLevelPresets();
  }

  /** The paths a book's content can target: what the codegen checks a book's modifiers and requirements against. */
  listBookTargetPaths(...args: Parameters<ModuleOf<B>["content"]["listBookTargetPaths"]>) {
    return Modules.of(this.baseRules).content.listBookTargetPaths(...args);
  }

  /** How its module stores its rulesets' data in the generic tables, which the server reads and writes them by. */
  storage() {
    return StorageEngine.of(this.baseRules);
  }
}
