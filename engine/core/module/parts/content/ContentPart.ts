import type { Descriptions } from "@/engine/core/module/contract.ts";
import type { OperatorKind, TargetPath } from "@/shared/customization/target.ts";

/**
 * What a ruleset answers its content's seeders and codegen, before any ruleset has a view: the paths a book's
 * modifiers and requirements may name, and the progressions a class's levels follow. Its content's seeds give their
 * fields as stored, which the seeders write as they are. `D` is what it describes in its own shape.
 */
export default abstract class ContentPart<D extends Descriptions = Descriptions> {
  /**
   * Each of a class's progressions' values at each level, by how good it is (`D["levelPresets"]`: 3.5's base attack
   * bonus's and saves'), which a class's seed names its progressions by: what its seeded levels store, and a book's
   * class table is classified by.
   */
  abstract describeLevelPresets(): D["levelPresets"];

  /**
   * The target paths a book's generated content may name, from the names it seeds (`names`, by kind: 3.5's abilities',
   * saves' and skills').
   */
  abstract listBookTargetPaths(names: Partial<Record<string, string[]>>, kind: OperatorKind): TargetPath[];
}
