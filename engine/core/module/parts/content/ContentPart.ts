import type { EntityWrites } from "@/engine/core/module/parts/entities/index.ts";
import type { OwnedKind } from "@/engine/core/view/index.ts";
import type { TargetPath } from "@/shared/customization/target.ts";

/**
 * What a ruleset answers its content's seeders and codegen, before any ruleset has a view: the paths a book's
 * modifiers and requirements may name, and what an owned entity's position requires. Its content's seeds give their
 * fields as stored, which the seeders write as they are.
 */
export default abstract class ContentPart {
  /**
   * The target paths a book's generated content may name, from the names it seeds (`names`, by kind: 3.5's abilities',
   * saves' and skills').
   */
  abstract listBookTargetPaths(
    names: Partial<Record<string, string[]>>,
    kind: "modifier" | "requirement",
  ): TargetPath[];

  /**
   * The requirement an owned entity of `ownedType` takes at `position` on its owner's track (its owner named
   * `ownerName`), as a new one's save writes it: 3.5's class level past the first, the class's previous level. None
   * when its position asks nothing.
   */
  abstract planPositionRequirement(
    ownedType: OwnedKind,
    ownerName: string,
    position: number,
  ): EntityWrites["requirement"];
}
