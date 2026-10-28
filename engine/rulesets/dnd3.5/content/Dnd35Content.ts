import { ContentPart } from "@/engine/core/module/index.ts";
import ClassLevelEntity from "@/engine/rulesets/dnd3.5/entities/classes/ClassLevelEntity.ts";

import BookPaths from "./BookPaths.ts";

/**
 * The 3.5 module's content, as the seeders and the codegen ask of it: what a book's modifiers and requirements can
 * target, and what a class level requires of its class.
 */
export default class Dnd35Content extends ContentPart {
  /** The target paths a book's generated content may name. */
  override listBookTargetPaths(...args: Parameters<typeof BookPaths.listBookTargetPaths>) {
    return BookPaths.listBookTargetPaths(...args);
  }

  /** A class level's requirement of its class's previous level, as a new one's save writes it: none of another kind. */
  override planPositionRequirement(ownedType: string, className: string, level: number) {
    return ownedType === "class-levels" ? ClassLevelEntity.planRequirement(className, level) : undefined;
  }
}
