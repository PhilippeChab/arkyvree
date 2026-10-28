import type { TargetPath } from "@/shared/customization/target.ts";

/**
 * What a ruleset answers its content's seeders and codegen, before any ruleset has a view: the paths a book's
 * modifiers and requirements may name. Its content's seeds give their fields as stored, which the seeders write as
 * they are.
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
}
