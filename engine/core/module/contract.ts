import type { PropertyTypesProvider } from "@/engine/core/customizations/index.ts";
import type { Fields } from "@/engine/core/fields/index.ts";
import type { TargetPaths } from "@/engine/core/paths/CategoryPaths.ts";

import type { CharactersPart, NotedSheet, SheetSummary } from "./parts/characters/index.ts";
import type { ContentPart } from "./parts/content/index.ts";
import type { EntitiesPart, EntityKindsContract } from "./parts/entities/index.ts";
import type { ImportsPart } from "./parts/imports/index.ts";
import type { LevelUpPart } from "./parts/levelUp/index.ts";
import type { RulesetPart } from "./parts/ruleset/index.ts";
import type { StorageDeclaration } from "./storage.ts";

/**
 * What a ruleset describes in its own shape, which the server hands to the client as it is: how a new character's
 * scores are set (`creation`) and what its creation picker adds to an option (`creationOption`), what a picked link's
 * room is (`linkRoom`: what a character has, and what one more pick may add), a character's sheet (as the API answers
 * it, its private notes where every ruleset's holds them; as a member who reads it partly reads it, its summary as
 * every ruleset's holds it; printed), what an inventory entry shows beside its row, and a level step's picker
 * (`stepPicker`) by the kind it reads a page of.
 */
export interface Descriptions {
  creation: object;
  creationOption: object;
  inventoryEntry: object;
  linkRoom: object;
  partialSheet: { summary: SheetSummary };
  sheet: NotedSheet;
  sheetDocument: unknown;
  stepPicker: { kind: string };
}

/**
 * A base rules' module: the parts the engine's handles ask what its rules answer, each an abstract class of
 * `engine/core/module/parts/` a ruleset extends (the compiler lists what a part lacks), its paths and property types,
 * and its storage. `D` is what it describes in its own shape, `E` its entity kinds by table, `F` the fields its content
 * seeds, by entity.
 */
export interface RulesetModule<
  D extends Descriptions = Descriptions,
  E extends EntityKindsContract = EntityKindsContract,
  F = Record<string, Fields>,
> {
  /** What the ruleset answers of its characters, from the rows the server reads: their sheets, their links, an item */
  characters: CharactersPart<D>;
  /** What the ruleset answers its content's seeders and codegen: the paths a book can target, its fields' properties */
  content: ContentPart<F>;
  createTargetPaths(): TargetPaths;
  /** What the ruleset answers of its entities: their fields, and what their forms write */
  entities: EntitiesPart<E>;
  /** What the ruleset answers of a character imported from another program's file: which importers it offers */
  imports: ImportsPart;
  /**
   * What its refusals and issues call an entity of each of its kinds and its other types ("Feat <id> does not belong to
   * this ruleset", "Bjorn (Character)"), which its view answers (`RulesetData.labelOf`)
   */
  kindLabels: Readonly<Record<string, string>>;
  /** What the ruleset answers a character's level-up, from the rows the server reads */
  levelUp: LevelUpPart<D>;
  /** The property types its entities' fields are stored in, their order and values: one instance nothing changes */
  propertyTypes: PropertyTypesProvider;
  /** What the ruleset answers of a ruleset as a whole, past its entities: what it needs to be published */
  ruleset: RulesetPart;
  /** How its rulesets' and characters' data is stored in the generic tables, and what their registries hold of it */
  storage: StorageDeclaration;
}
