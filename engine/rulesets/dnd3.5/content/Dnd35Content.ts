import { ContentPart } from "@/engine/core/module/index.ts";

import BookPaths from "./BookPaths.ts";

/**
 * The 3.5 module's content, as the seeders and the codegen ask of it: what a book's modifiers and requirements can
 * target.
 */
export default class Dnd35Content extends ContentPart {
  /** The target paths a book's generated content may name. */
  override listBookTargetPaths(...args: Parameters<typeof BookPaths.listBookTargetPaths>) {
    return BookPaths.listBookTargetPaths(...args);
  }
}
