import { CharacterInputs, type FieldsRequest } from "@/engine/core/module/index.ts";
import { RACE_ROLE } from "@/engine/rulesets/pf1/characters/CharacterValues.ts";
import DetailedCharacter from "@/engine/rulesets/pf1/model/DetailedCharacter.ts";
import Pf1CharacterBuilder from "@/engine/rulesets/pf1/model/Pf1CharacterBuilder.ts";
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
} from "@/vocabulary/pf1/fields/index.ts";

import { getPf1SeedCtx } from "./seed.ts";

/**
 * A new Pathfinder character as a test names it: its race and ability scores by name (every unnamed ability at 10), its
 * fields by the stored field that keeps each (a Neutral man of 25, 180 tall and 80 heavy, with no experience,
 * unless given), and the ruleset it's made on (the seeded core rules, unless given).
 */
export interface NewPf1Character {
  abilities?: Record<string, number>;
  fields?: FieldsRequest;
  race?: string;
  rulesetId?: string;
}

/** A test character's fields, unless it's given its own. */
const NEW_FIELDS: FieldsRequest = {
  [CHARACTER_AGE]: 25,
  [CHARACTER_ALIGNMENT]: "Neutral",
  [CHARACTER_GENDER]: "Male",
  [CHARACTER_HEIGHT]: "180",
  [CHARACTER_WEIGHT]: "80",
  [CHARACTER_XP]: 0,
};

/**
 * `characterId`, a Pathfinder character, built the way the engine builds one (`Pf1CharacterBuilder`: of its row's
 * kind): its rows read as the server reads them (`readCharacterInput`), their references resolved through its
 * ruleset's view, as the engine's character handle reads them. Refused when it builds as no Pathfinder character.
 */
export async function buildCharacter(characterId: string) {
  const record = await Characters.findOne(db, { id: characterId }, Visibility.All);
  if (!record) throw new Error(`No character ${characterId}`);
  const built = await withRulesetScope(db, record.rulesetId, async (scope) => {
    const input = CharacterInputs.resolve(await readCharacterInput(db, record), scope.rulesetData.cow);
    return Pf1CharacterBuilder.build(scope, input);
  });
  if (!(built instanceof DetailedCharacter)) throw new Error(`${record.name} doesn't build as a Pathfinder character`);
  return built;
}

/**
 * A new Pathfinder character of `session`'s, created through the service as the create dialog sends it: its race's pick
 * and its ability scores by id, a Human with every ability at 10 on the seeded core rules unless `values` says
 * otherwise.
 */
export async function createPf1Character(session: Session, values: NewPf1Character = {}) {
  const ctx = await getPf1SeedCtx();
  const { abilities = {}, fields = {}, race = "Human", rulesetId = ctx.rulesetId } = values;
  const scores = Object.fromEntries(Object.entries(ctx.abilityMap).map(([name, id]) => [id, abilities[name] ?? 10]));
  return await CharactersService.createCharacter(session, {
    rulesetId,
    name: `Test Pathfinder Character ${uniqueId()}`,
    picks: { [RACE_ROLE]: ctx.raceMap.pc[race] },
    scores: { score: scores },
    fields: { ...NEW_FIELDS, ...fields },
  });
}
