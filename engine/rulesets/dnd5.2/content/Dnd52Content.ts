import { ContentPart } from "@/engine/core/module/index.ts";
import type { Dnd52Descriptions } from "@/engine/rulesets/dnd5.2/descriptions.ts";
import ClassProgressions from "@/engine/rulesets/dnd5.2/rules/ClassProgressions.ts";

import BookPaths from "./BookPaths.ts";

/**
 * The D&D 5th Edition module's content, as the seeders and the codegen ask of it: what a book's modifiers and requirements can
 * target, and the progressions a class's levels follow.
 */
export default class Dnd52Content extends ContentPart<Dnd52Descriptions> {
  /** What every class's levels follow, by level: the Proficiency Bonus. */
  override describeLevelPresets() {
    return ClassProgressions.describePresets();
  }

  /** The target paths a book's generated content may name. */
  override listBookTargetPaths(...args: Parameters<typeof BookPaths.listBookTargetPaths>) {
    return BookPaths.listBookTargetPaths(...args);
  }
}
