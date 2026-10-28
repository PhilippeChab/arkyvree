import type { ContentPart } from "@/engine/core/module/index.ts";

/** The engine bound to a base rules' content, which the seeders and the codegen ask before any ruleset has a view. */
export default class ContentEngine {
  constructor(private readonly content: ContentPart) {}

  /** The paths a book's content can target: what the codegen checks a book's modifiers and requirements against. */
  listBookTargetPaths(...args: Parameters<ContentPart["listBookTargetPaths"]>) {
    return this.content.listBookTargetPaths(...args);
  }

  /**
   * What an owned entity requires at its position on its owner's track, as a new one's save writes it: what the seeders
   * write of the content's (3.5's class levels).
   */
  planPositionRequirement(...args: Parameters<ContentPart["planPositionRequirement"]>) {
    return this.content.planPositionRequirement(...args);
  }
}
