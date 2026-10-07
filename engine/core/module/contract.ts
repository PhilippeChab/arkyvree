import type {
  characterAbilitiesInCharacter,
  languagesInCharacter,
  levelFeatsInCharacter,
  levelPowersInCharacter,
  levelSkillsInCharacter,
} from "@/drizzle/schema.ts";
import type {
  Components,
  PropertyTypesProvider,
  RequirementIssue,
  RulesetView,
  TargetPathsInterface,
  ValidationResult,
} from "@/engine/core/types.ts";
import type {
  Campaign,
  CharacterInventory,
  CharacterLevel,
  Character as CharacterRecord,
  Item,
  Modifier,
  Player,
  Property,
  Requirement,
  Ruleset,
} from "@/shared/relations.ts";

/**
 * A character's row and the rows it's built from, as the server reads them in its ruleset's scope: a bonded creature's
 * with its master's (`master`), whose sheet the creature's derives from.
 */
export interface CharacterInput {
  master?: CharacterInput;
  record: CharacterRecord;
  rows: CharacterRows;
}

/**
 * A character's own rows, which the server reads (`server/builds/`) and its module builds the character from: its seat
 * in a campaign, its ability scores, languages, inventory and levels, every saved level's picks (the links, whose
 * entities are the view's), and the modifiers set on the character itself, with their requirements. Read in its
 * ruleset's scope, their references are the view's ids.
 */
export interface CharacterRows {
  abilities: (typeof characterAbilitiesInCharacter.$inferSelect)[];
  campaign: Campaign | undefined;
  inventory: (CharacterInventory & { itemsInRule: Item })[];
  languages: (typeof languagesInCharacter.$inferSelect)[];
  levels: CharacterLevel[];
  modifiers: Modifier[];
  picks: {
    feats: (typeof levelFeatsInCharacter.$inferSelect)[];
    powers: (typeof levelPowersInCharacter.$inferSelect)[];
    skills: (typeof levelSkillsInCharacter.$inferSelect)[];
  };
  player: Player | undefined;
  requirements: Requirement[];
}

export interface DetailedCharacterInterface {
  areRequirementsMet(requirementGroups: Requirement[][], context?: { sourceId?: string | null }): boolean;
  /**
   * Builds the character from its rows (`rows`), in its ruleset's `view`, with a level-up's `projectedData`: a bonded
   * creature's `master` built first. A build reads nothing: the server reads what it's given (`buildCharacter`).
   */
  build(rows: CharacterRows, view: RulesetView, projectedData?: unknown, master?: DetailedCharacterInterface): void;
  readonly components: Components;
  formatRequirements(requirements: Requirement[]): string;
  getCampaign(): Campaign | undefined;
  getPlayer(): Player | undefined;
  getRuleset(): Ruleset | undefined;
  getUnmetRequirementIssues(requirementGroups: Requirement[][]): RequirementIssue[];
  validate(): ValidationResult;
}

/**
 * A base rules' module, typed by what it builds: its characters and the kinds of character it knows. Its parts are its
 * own, each typed by the module (`Dnd35RulesetModule`), which `getRulesetModule` hands out as it is: what it answers of
 * its characters (`characters`), of its entities (`entities`) and of their level-ups (`levelUp`).
 */
export interface RulesetModule<
  Character extends DetailedCharacterInterface = DetailedCharacterInterface,
  Kind extends string = string,
> {
  /** What the ruleset answers of its characters, from the rows the server reads: their sheets, an item equipped */
  characters: object;
  /** What the ruleset answers its content's seeders and codegen: the paths a book can target, its fields' properties */
  content: object;
  createDetailedCharacter(record: CharacterRecord, kind?: Kind): Character;
  createPropertyTypes(): PropertyTypesProvider;
  createTargetPaths(): TargetPathsInterface;
  /** What the ruleset answers of its entities: their fields, and what saving one writes */
  entities: object;
  /** What the ruleset answers a character's level-up, from the rows the server reads */
  levelUp: object;
  /** An entity's properties in the order its rules list them, which its view keeps them in */
  orderProperties(properties: Property[]): Property[];
}
