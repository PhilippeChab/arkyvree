import type { PropertyTypesProvider } from "@/engine/core/customizations/index.ts";
import type { Fields } from "@/engine/core/fields/index.ts";
import type { TargetPaths } from "@/engine/core/paths/CategoryPaths.ts";

import type {
  CharactersPart,
  ContentPart,
  EntitiesPart,
  EntityKindsContract,
  LevelUpPart,
  RulesetPart,
} from "./parts/index.ts";

/**
 * What a ruleset describes in its own shape, which the server hands to the client as it is: a character's sheet (as the
 * API answers it, as a member reads it, printed), the level-up wizard's steps (any of them, each named for which it
 * is), preview and a saved level's selections, and what each picker adds to an option.
 */
export interface Descriptions {
  classOption: object;
  featGroup: object;
  featOption: object;
  levelSelections: unknown;
  memberSheet: unknown;
  powerOption: object;
  preview: unknown;
  raceOption: object;
  sheet: unknown;
  sheetDocument: unknown;
  step: { name: string };
}

/**
 * A base rules' module: the parts the engine's handles ask what its rules answer, each an abstract class of
 * `engine/core/module/parts/` a ruleset extends (the compiler lists what a part lacks), and its paths and property
 * types. `D` is what it describes in its own shape, `E` its entity kinds by table, `F` the fields its content seeds, by entity.
 */
export interface RulesetModule<
  D extends Descriptions = Descriptions,
  E extends EntityKindsContract = EntityKindsContract,
  F extends Record<string, Fields> = Record<string, Fields>,
> {
  /** What the ruleset answers of its characters, from the rows the server reads: their sheets, an item equipped */
  characters: CharactersPart<D>;
  /** What the ruleset answers its content's seeders and codegen: the paths a book can target, its fields' properties */
  content: ContentPart<F>;
  createPropertyTypes(): PropertyTypesProvider;
  createTargetPaths(): TargetPaths;
  /** What the ruleset answers of its entities: their fields, and what saving one writes */
  entities: EntitiesPart<E>;
  /** What the ruleset answers a character's level-up, from the rows the server reads */
  levelUp: LevelUpPart<D>;
  /** What the ruleset answers of a ruleset as a whole, past its entities: what it needs to be published */
  ruleset: RulesetPart;
}
