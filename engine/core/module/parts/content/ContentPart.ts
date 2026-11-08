import type { Descriptions } from "@/engine/core/module/contract.ts";
import type { MadeEntity } from "@/engine/core/module/parts/entities/index.ts";
import type { OperatorKind, TargetPath } from "@/shared/customization/target.ts";

/**
 * An entity a ruleset's entity brings with it (a skill's feats), as its seeders write it for the ruleset's own: its type,
 * the pools it's listed in, by name, its fields as stored, and its customizations.
 */
export interface BroughtEntity extends Pick<MadeEntity, "modifiers" | "requirements"> {
  description: string;
  fields: Record<string, unknown>;
  name: string;
  pools: string[];
  type: string;
}

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

  /**
   * What an entity of a kind brings with it (`kind`, `name`: a skill's feats), as the engine makes them for one a ruleset
   * adds: what the seeders write for a book's own, so the two are one. None, unless the ruleset says.
   */
  describeBroughtEntities(_kind: string, _name: string): BroughtEntity[] {
    return [];
  }
}
