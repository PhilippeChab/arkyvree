import { ContentPart } from "@/engine/core/module/index.ts";
import type { Pf1Descriptions } from "@/engine/rulesets/pf1/descriptions.ts";
import ClassProgressions from "@/engine/rulesets/pf1/rules/ClassProgressions.ts";

import BookPaths from "./BookPaths.ts";

/**
 * The Pathfinder module's content, as the seeders and the codegen ask of it: what a book's modifiers and requirements can
 * target, and the progressions a class's levels follow.
 */
export default class Pf1Content extends ContentPart<Pf1Descriptions> {
  /** A class's base attack bonus's and saves' values at each class level, by how good each is. */
  override describeLevelPresets() {
    return ClassProgressions.describePresets();
  }

  /** The target paths a book's generated content may name. */
  override listBookTargetPaths(...args: Parameters<typeof BookPaths.listBookTargetPaths>) {
    return BookPaths.listBookTargetPaths(...args);
  }
}
