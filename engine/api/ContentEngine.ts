import type { ContentPart } from "@/engine/core/module/index.ts";

/** The engine bound to a base rules' content, which the seeders and the codegen ask before any ruleset has a view. */
export default class ContentEngine {
  constructor(private readonly content: ContentPart) {}

  /** The paths a book's content can target: what the codegen checks a book's modifiers and requirements against. */
  listBookTargetPaths(...args: Parameters<ContentPart["listBookTargetPaths"]>) {
    return this.content.listBookTargetPaths(...args);
  }
}
