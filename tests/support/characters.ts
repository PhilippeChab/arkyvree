import type { InferInsertModel } from "drizzle-orm";
import type { InferRequestType } from "hono/client";

import type { charactersInCharacter } from "@/drizzle/schema.ts";
import type { DetailedCharacterInterface } from "@/engine/core/module/index.ts";
import { buildCharacter } from "@/server/builds/index.ts";
import type { RulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { type Db, db } from "@/server/database/index.ts";
import { Characters } from "@/server/repositories/index.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import type { Character, Session } from "@/shared/relations.ts";

import { api, expectOk } from "./api.ts";
import { getSeedCtx, uniqueId } from "./seed.ts";

/**
 * `record`, built as the class a test picks (`Kind`: a familiar, a mount…) the way the server builds a character
 * (`buildCharacter`): its rows read, in `scope` when given, a bonded creature's master built first.
 */
export async function buildAs<C extends DetailedCharacterInterface>(
  Kind: new (record: Character) => C,
  record: Character,
  options: { database?: Db; projected?: Parameters<C["build"]>[2]; scope?: RulesetScope } = {},
) {
  return await buildCharacter({ createDetailedCharacter: (made: Character) => new Kind(made) }, record, options);
}

/**
 * A new character of `session`'s, created through the service: a Human on the seeded ruleset, unless `values` says
 * otherwise.
 */
export async function createCharacterAs(
  session: Session,
  values: Partial<Parameters<typeof CharactersService.createCharacter>[1]> = {},
) {
  const { rulesetId, raceMap } = await getSeedCtx();
  return await CharactersService.createCharacter(session, {
    rulesetId,
    raceId: raceMap.pc["Human"],
    name: `Test Character ${uniqueId()}`,
    xp: 0,
    alignment: "True Neutral",
    abilities: {},
    age: 25,
    gender: "Male",
    height: "180",
    weight: "80",
    ...values,
  });
}

/**
 * A human character of `userId`'s on the seeded ruleset, written straight to
 * the database: no abilities, levels or activity. Create one with
 * `createCharacterAs` when the test needs those.
 */
export async function createTestCharacter(
  userId: string,
  values: Partial<InferInsertModel<typeof charactersInCharacter>> = {},
) {
  const ctx = await getSeedCtx();
  const [character] = await Characters.create(db, {
    userId,
    rulesetId: ctx.rulesetId,
    raceId: ctx.raceMap.pc["Human"],
    name: `Test Character ${uniqueId()}`,
    xp: 0,
    alignment: "Neutral Good",
    age: 25,
    gender: "Male",
    height: "180",
    weight: "75",
    ...values,
  });
  return character;
}

/**
 * A new character of the seed user's, created through the API: a Human on the seeded ruleset with every ability at 10,
 * unless `json` says otherwise.
 */
export async function postCharacter(json: Partial<InferRequestType<typeof api.api.characters.$post>["json"]> = {}) {
  const ctx = await getSeedCtx();
  const { rulesetId = ctx.rulesetId, name = `Test Character ${uniqueId()}`, ...rest } = json;
  return await expectOk(
    api.api.characters.$post({
      json: {
        raceId: ctx.raceMap.pc["Human"],
        xp: 0,
        alignment: "True Neutral",
        abilities: Object.fromEntries(Object.values(ctx.abilityMap).map((id) => [id, 10])),
        age: 25,
        gender: "Male",
        height: "180",
        weight: "80",
        ...rest,
        rulesetId,
        name,
      },
    }),
  );
}
