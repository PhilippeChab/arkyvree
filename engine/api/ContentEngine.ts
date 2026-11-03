import type { ContentPart, Descriptions } from "@/engine/core/module/index.ts";

/**
 * The engine bound to a base rules' content, which the seeders and the codegen ask before any ruleset has a view, by
 * that module's own shapes (`D`).
 */
export default class ContentEngine<D extends Descriptions> {
  constructor(private readonly content: ContentPart<D>) {}

  /**
   * A class's progressions' values at each level, by how good each is: what the seeders store a class's levels by, and
   * the codegen classifies a book's class table by.
   */
  describeLevelPresets() {
    return this.content.describeLevelPresets();
  }

  /** The paths a book's content can target: what the codegen checks a book's modifiers and requirements against. */
  listBookTargetPaths(...args: Parameters<ContentPart["listBookTargetPaths"]>) {
    return this.content.listBookTargetPaths(...args);
  }
}
