/** A list's cards of characters from several rulesets, each described in its own ruleset's view. */

import { Engine, type StoredAdvancement } from "@/engine/index.ts";
import type { RulesetScope } from "@/server/cow/index.ts";
import type { Character } from "@/shared/relations.ts";

/**
 * The cards of a list of characters (each with its ruleset's view among `views`, `withRulesetScopes`', and its
 * advancements among `advancements`), by id, as the engine describes each: its id, name and description, and its chips
 * (its race, then its classes at their highest level); a partly seen one's (among `partialIds`) its partial reading's,
 * with no description.
 */
export function describeCharacterCards(
  views: Map<string, RulesetScope>,
  characters: Character[],
  advancements: StoredAdvancement[],
  partialIds: ReadonlySet<string>,
) {
  const byCharacter = Map.groupBy(advancements, (advancement) => advancement.characterId);
  return new Map(
    characters.map((character) => {
      const own = byCharacter.get(character.id) ?? [];
      const card = Engine.describeCard(views.get(character.rulesetId), character, own, partialIds.has(character.id));
      return [character.id, card];
    }),
  );
}
