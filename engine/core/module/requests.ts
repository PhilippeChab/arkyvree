/**
 * What an operation takes, past the rows the server read (`CharacterInputs`) and the view: a form's request, a step's
 * or a picker's query, how a reader reads a sheet. One named type per input; whether to force the rules is always an
 * operation's last argument, never a request's field.
 */

import type { ItemLocation } from "@/shared/enums.ts";
import type { Item } from "@/shared/relations.ts";

import type { AbilityIncrease, FeatPick, InventoryEntryPlan } from "./plans.ts";

/** A form's ability scores, by ability id. */
export type AbilitiesRequest = Record<string, number>;

/** A feat picker's query: a level's pool, and a family's feats when it names one. */
export type FeatPickQuery = PickQuery & { family?: string };

/** What an inventory entry's add (a new entry of `item`) or edit (an `entry` of the character's) asks. */
export type InventoryEntryChange =
  | { item: Item; request: InventoryEntryRequest }
  | { entry: { id: string; itemId: string }; request: InventoryEntryRequest };

/** What an inventory entry's add or edit asks: the fields it stores, which the plan answers checked. */
export type InventoryEntryRequest = InventoryEntryPlan;

/** A saved level's edit, as the form sends it: its new hit points, ability increases and picks. */
export type LevelEditRequest = LevelPicks & { abilityIncreases: AbilityIncrease[]; hp: number };

/** A level's picks, as a form sends them: its skill ranks, and its feats and powers by the pool they're picked in. */
export interface LevelPicks {
  feats: Record<string, string[]>;
  powers: Record<string, string[]>;
  skills: Record<string, number>;
}

/**
 * The level a level-up wizard's step or picker is for, as the wizard asks for it: class `klassId`'s `level` (a step that
 * reads the level's class refuses to answer without them) and its ability increases, after the levels the wizard plans
 * before it (`planned`), or in the place of the saved level it edits (`editedLevelId`), and what the wizard picked at
 * it so far (`picks`), which a step says what it comes to.
 */
export interface LevelQuery {
  abilityIncreases?: AbilityIncrease[];
  editedLevelId?: string;
  klassId?: string;
  level?: number;
  picks?: Partial<LevelPicks>;
  planned?: PlannedSoFar;
}

/** A level a level-up writes, as the wizard sends it: its class's level, hit points and ability increases. */
export interface LevelRequest {
  abilityIncreases: AbilityIncrease[];
  hp: number;
  klassId: string;
  level: number;
}

/** A level-up, as the wizard sends it: its levels, and its picks, which the rules spread over them. */
export interface LevelUpRequest {
  levels: LevelRequest[];
  picks: LevelPicks;
}

/** How a campaign member reads a character: partly (`partial`), or its sheet with its private notes shown or blank. */
export type MemberReading = "blank" | "partial" | "show";

/** A new character, as its form sends it: its race, and its ability scores. */
export interface NewCharacterRequest {
  abilities: AbilitiesRequest;
  raceId: string;
}

/** A feat's or a power's picker query: a level, its class's, and the pool it picks in (`aptitudeId`). */
export type PickQuery = LevelQuery & { aptitudeId: string; klassId: string; level: number };

/** Where an inventory dialog places an item: `location`, in `weaponSet` for a hand, the entry placed (`entryId`) aside. */
export interface PlacementQuery {
  entryId: string | null;
  location: ItemLocation;
  weaponSet: number | null;
}

/**
 * What the level-up wizard plans before the level a step or a picker is for, not saved yet: its levels (their class
 * levels, and their ability increases by place), and the feats and skill points picked over them so far.
 */
export interface PlannedSoFar {
  abilityIncreases?: AbilityIncrease[][];
  featPicks?: FeatPick[];
  klassLevelIds?: string[];
  skillPoints?: Record<string, number>;
}

/** A power picker's query: a level's pool, of a spell level when given, less the powers picked so far. */
export type PowerPickQuery = PickQuery & { powerLevel?: number; selectedPowerIds?: string[] };

/** The level-up wizard's preview: the levels it plans, each with its ability increases, and what it picked so far. */
export interface PreviewRequest {
  levels: Omit<LevelRequest, "hp">[];
  picks?: Partial<LevelPicks>;
}

/** What a viewer reads of a character's private notes: all of it, a blank, or no field at all. */
export type PrivateNotes = "blank" | "omit" | "show";

/** The race picker's query: what a new character's form says so far. */
export interface RacePickQuery {
  alignment?: string;
  gender?: string;
}

/** A printed sheet's request: whether it adds the diagnostics page, and the character's portrait. */
export interface SheetRequest {
  diagnostics: boolean;
  portraitUrl?: string | null;
}
