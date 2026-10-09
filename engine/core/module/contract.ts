import type { PropertyTypesProvider } from "@/engine/core/customizations/index.ts";
import type { TargetPaths } from "@/engine/core/paths/CategoryPaths.ts";

/**
 * A base rules' module. Its parts are its own, each typed by the module's own type, which `getRulesetModule` hands out
 * as it is: what it answers of its characters (`characters`), of its entities (`entities`), of their
 * level-ups (`levelUp`) and to its content's seeders and codegen (`content`); its paths and property types, and the
 * .
 */
export interface RulesetModule {
  /** What the ruleset answers of its characters, from the rows the server reads: their sheets, an item equipped */
  characters: object;
  /** What the ruleset answers its content's seeders and codegen: the paths a book can target, its fields' properties */
  content: object;
  createPropertyTypes(): PropertyTypesProvider;
  createTargetPaths(): TargetPaths;
  /** What the ruleset answers of its entities: their fields, and what saving one writes */
  entities: object;
  /** What the ruleset answers a character's level-up, from the rows the server reads */
  levelUp: object;
}
