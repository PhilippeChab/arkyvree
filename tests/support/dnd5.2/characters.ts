import { CharacterInputs, type FieldsRequest } from "@/engine/core/module/index.ts";
import { BACKGROUND_ROLE, SPECIES_ROLE } from "@/engine/rulesets/dnd5.2/characters/CharacterValues.ts";
import Dnd52CharacterBuilder from "@/engine/rulesets/dnd5.2/model/Dnd52CharacterBuilder.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Characters, Visibility } from "@/server/repositories/index.ts";
import { CharactersService, readCharacterInput } from "@/server/services/characters/index.ts";
import type { Session } from "@/shared/relations.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "@/vocabulary/dnd5.2/fields/index.ts";

import { getDnd52SeedCtx } from "./seed.ts";

/**
 * A new D&D 5th Edition character as a test names it: its species, its background and its ability scores by name
 * (every unnamed ability at 10), its fields by the stored field that keeps each (a Neutral man of 25, 180 tall and 80
 * heavy, with experience enough for any level, unless given), and the ruleset it's made on (the seeded core rules,
 * unless given).
 */
export interface NewDnd52Character {
  abilities?: Record<string, number>;
  background?: string;
  fields?: FieldsRequest;
  rulesetId?: string;
  species?: string;
}

/** A test character's fields, unless it's given its own. */
const NEW_FIELDS: FieldsRequest = {
  [CHARACTER_AGE]: 25,
  [CHARACTER_ALIGNMENT]: "Neutral",
  [CHARACTER_GENDER]: "Male",
  [CHARACTER_HEIGHT]: "180",
  [CHARACTER_WEIGHT]: "80",
  [CHARACTER_XP]: 355_000,
};

/**
 * `characterId`, a D&D 5th Edition character, built the way the engine builds one (`Dnd52CharacterBuilder`): its rows
 * read as the server reads them (`readCharacterInput`), their references resolved through its ruleset's view, as the
 * engine's character handle reads them.
 */
export async function buildCharacter(characterId: string) {
  const record = await Characters.findOne(db, { id: characterId }, Visibility.All);
  if (!record) throw new Error(`No character ${characterId}`);
  return await withRulesetScope(db, record.rulesetId, async (scope) => {
    const input = CharacterInputs.resolve(await readCharacterInput(db, record), scope.rulesetData.cow);
    return Dnd52CharacterBuilder.build(scope, input);
  });
}

/**
 * A new D&D 5th Edition character of `session`'s, created through the service as the create dialog sends it: its
 * species' and background's picks and its ability scores by id, a Human Soldier with every ability at 10 on the seeded
 * core rules unless `values` says otherwise.
 */
export async function createDnd52Character(session: Session, values: NewDnd52Character = {}) {
  const ctx = await getDnd52SeedCtx();
  const { abilities = {}, background = "Soldier", fields = {}, species = "Human", rulesetId = ctx.rulesetId } = values;
  const scores = Object.fromEntries(Object.entries(ctx.abilityMap).map(([name, id]) => [id, abilities[name] ?? 10]));
  return await CharactersService.createCharacter(session, {
    rulesetId,
    name: `Test 5e Character ${uniqueId()}`,
    picks: { [SPECIES_ROLE]: ctx.speciesMap[species], [BACKGROUND_ROLE]: ctx.backgroundMap[background] },
    scores: { score: scores },
    fields: { ...NEW_FIELDS, ...fields },
  });
}
