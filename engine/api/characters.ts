import type { RulesetView } from "@/engine/core/types.ts";
import type { Item } from "@/shared/relations.ts";

import { type After, getRulesetModule } from "./modules.ts";

/** The ruleset's characters: what its module answers of them. */
type Characters = ReturnType<typeof getRulesetModule>["characters"];

/** The ruleset's characters. */
function charactersOf(view: RulesetView): Characters {
  return getRulesetModule(view.ruleset.baseRules).characters;
}

/** Refuses languages a character can't speak: not found among the rows read, or not of its ruleset nor its chain. */
export function checkCharacterLanguages(view: RulesetView, ...args: After<Characters["checkCharacterLanguages"]>) {
  charactersOf(view).checkCharacterLanguages(view, ...args);
}

/**
 * A character as a campaign member reads it (`reading`): partly, who it is and what it looks like (`partial`), or its
 * sheet with its bonded creatures', their private notes shown or blank.
 */
export function describeCampaignCharacter(view: RulesetView, ...args: After<Characters["describeCampaignCharacter"]>) {
  return charactersOf(view).describeCampaignCharacter(view, ...args);
}

/**
 * A character's sheet, as the API answers it, from its rows: a player character's with its bonded creatures', their
 * private notes as the viewer reads them (all of them, blank, or no field); or a bonded creature's, from its master's.
 */
export function describeCharacter(view: RulesetView, ...args: After<Characters["describeCharacter"]>) {
  return charactersOf(view).describeCharacter(view, ...args);
}

/**
 * The cards of a list of characters (each with its ruleset's view among `views`, and its levels among `levels`), as
 * the list shows them: its race, its classes at their highest level, its total level. A character whose ruleset the
 * list didn't read shows none.
 */
export function describeCharacterCards(
  views: Map<string, RulesetView>,
  characters: { id: string; raceId: string; rulesetId: string }[],
  levels: { characterId: string; klassLevelId: string }[],
) {
  const levelsByCharacter = Map.groupBy(levels, (level) => level.characterId);
  return new Map(
    characters.map((character) => {
      const view = views.get(character.rulesetId);
      const card = view
        ? charactersOf(view).describeCharacterCard(view, character, levelsByCharacter.get(character.id) ?? [])
        : { levels: [], race: "Unknown", totalLevel: 0 };
      return [character.id, card];
    }),
  );
}

/** A character's printed sheet, from its rows: the PDF document the server renders. */
export function describeCharacterSheet(view: RulesetView, ...args: After<Characters["describeCharacterSheet"]>) {
  return charactersOf(view).describeCharacterSheet(view, ...args);
}

/** A character's inventory entries (each with the item row it names), as its sheet lists them. */
export function describeInventory<T extends { itemId: string; itemsInRule: Item }>(view: RulesetView, entries: T[]) {
  return charactersOf(view).describeInventory(view, entries);
}

/** The race picker for a new character of what its form says: each race of a page, with whether it can pick it. */
export function openRacePicker(view: RulesetView, ...args: After<Characters["openRacePicker"]>) {
  return charactersOf(view).openRacePicker(view, ...args);
}

/** What a new character stores beside its row: its ability scores, refused when its race isn't a player's. */
export function planCharacterCreate(view: RulesetView, ...args: After<Characters["planCharacterCreate"]>) {
  return charactersOf(view).planCharacterCreate(view, ...args);
}

/**
 * What an inventory entry's add or edit stores, from the character's rows: its placement and charges, refused when the
 * item isn't the ruleset's, its charges disagree, or it can't be equipped where the request asks.
 */
export function planInventoryEntry(view: RulesetView, ...args: After<Characters["planInventoryEntry"]>) {
  return charactersOf(view).planInventoryEntry(view, ...args);
}
