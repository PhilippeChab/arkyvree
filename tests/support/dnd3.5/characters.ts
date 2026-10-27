import type { InferRequestType } from "hono/client";

import type { Db } from "@/drizzle/database.ts";
import { CharacterInputs, type FieldsRequest } from "@/engine/core/module/index.ts";
import { RACE_ROLE } from "@/engine/rulesets/dnd3.5/characters/CharacterValues.ts";
import CharacterResponse from "@/engine/rulesets/dnd3.5/characters/description/CharacterResponse.ts";
import CharacterProjection from "@/engine/rulesets/dnd3.5/levelUp/CharacterProjection.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import Dnd35CharacterBuilder from "@/engine/rulesets/dnd3.5/model/Dnd35CharacterBuilder.ts";
import { type RulesetScope, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Characters, Visibility } from "@/server/repositories/index.ts";
import { CharactersService, readCharacterInput } from "@/server/services/characters/index.ts";
import type { Character, Session } from "@/shared/relations.ts";
import { api, expectOk } from "@/tests/support/api.ts";
import { getSeedCtx, uniqueId } from "@/tests/support/seed.ts";
import { PLAYER_CHARACTER_KIND } from "@/vocabulary/dnd3.5/bondedKinds.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_FIELDS,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "@/vocabulary/dnd3.5/fields/index.ts";
import type { Alignment, Gender } from "@/vocabulary/dnd3.5/identity.ts";

/**
 * A new character's fields, past those every character has, by their names among 3.5's declarations
 * (`CHARACTER_FIELDS`), which its form sends by their stored fields, and its description.
 */
interface NewFields {
  age?: number | null;
  alignment?: Alignment;
  deity?: string;
  description?: string;
  gender?: Gender;
  height?: string;
  weight?: string;
  xp?: number;
}

/**
 * A 3.5 character's start as a test names it: its race (`links.race`, the link its creation pick makes) and its ability
 * scores (`abilities`, its scored link's amounts), which a create sends as its `picks` and `scores`, by role.
 */
interface NewStart {
  abilities?: Record<string, number>;
  links?: { race?: string };
}

/**
 * A test character's fields, unless it's given its own: a True Neutral man of 25, 180 tall and 80 heavy, with no
 * experience.
 */
const NEW_FIELDS = { age: 25, alignment: "True Neutral", gender: "Male", height: "180", weight: "80", xp: 0 };

/**
 * A new character's request split: its fields (3.5's form's, by the stored field that keeps each: a True Neutral man of
 * 25, 180 tall and 80 heavy, with no experience, unless given; its description), sent under `fields` with those it
 * sends as they are (`fields`), and the rest as it is.
 */
function splitFields<T extends NewFields & { fields?: FieldsRequest }>(values: T) {
  const { age, alignment, deity, description, fields, gender, height, weight, xp, ...rest } = values;
  const given = { age, alignment, deity, gender, height, weight, xp };
  const named = {
    ...NEW_FIELDS,
    ...Object.fromEntries(Object.entries(given).filter(([, value]) => value !== undefined)),
  };
  const stored = Object.entries(named).map(([name, value]) => [
    CHARACTER_FIELDS[name as keyof typeof CHARACTER_FIELDS].field,
    value,
  ]);
  return {
    fields: {
      ...Object.fromEntries(stored),
      ...(description !== undefined && { description }),
      ...fields,
    } as FieldsRequest,
    rest,
  };
}

/**
 * A create's `picks` and `scores` of a test's 3.5 start (`links.race`, `abilities`), past its default one (`start`: its
 * race, `race`, and its abilities), and the rest of what it gives.
 */
function splitStart<T extends NewStart>(values: T, start: { abilities: Record<string, number>; race: string }) {
  const { abilities = start.abilities, links: { race = start.race } = {}, ...rest } = values;
  return { picks: { [RACE_ROLE]: race }, scores: { score: abilities }, rest };
}

/**
 * `record`, built as the engine builds it (`buildCharacter`), as the 3.5 class a test reads it as (`Kind`: a player
 * character, a familiar, a mount…): refused when its row's kind builds another.
 */
export async function buildAs<C extends DetailedCharacter>(
  Kind: new (record: Character) => C,
  record: Character,
  options?: Parameters<typeof buildCharacter>[1],
) {
  const character = await buildCharacter(record, options);
  if (!(character instanceof Kind) || character.constructor !== Kind)
    throw new Error(`${record.name} builds as a ${character.constructor.name}, not a ${Kind.name}`);
  return character;
}

/**
 * `record`, a 3.5 character, built the way the engine builds one (`Dnd35CharacterBuilder`: of its row's kind, a
 * bonded creature's master built first): its rows read through `database`, in `scope` when it's the character's
 * ruleset's, with what a level-up adds when the test projects some (`project`).
 */
export async function buildCharacter(
  record: Character,
  {
    database = db,
    project,
    scope,
  }: { database?: Db; project?: (projection: CharacterProjection) => void; scope?: RulesetScope } = {},
) {
  const build = async (view: RulesetScope) => {
    // As the engine's character handle reads them: its rows' references resolved through the view
    const read = CharacterInputs.resolve(await readCharacterInput(database, record), view.rulesetData.cow);
    // With what a level-up adds, when the test projects some
    const projection = new CharacterProjection(read);
    project?.(projection);
    return Dnd35CharacterBuilder.build(view, projection.input);
  };
  if (scope?.ruleset.id !== record.rulesetId) return await withRulesetScope(database, record.rulesetId, build);
  return await build(scope);
}

/**
 * A new character of `session`'s, created through the service: a Human on the seeded ruleset, unless `values` says
 * otherwise.
 */
export async function createCharacterAs(
  session: Session,
  values: Partial<Parameters<typeof CharactersService.createCharacter>[1]> & NewFields & NewStart = {},
) {
  const { rulesetId, raceMap } = await getSeedCtx();
  const { fields, rest: given } = splitFields(values);
  const { picks, scores, rest } = splitStart(given, { abilities: {}, race: raceMap.pc["Human"] });
  return await CharactersService.createCharacter(session, {
    rulesetId,
    name: `Test Character ${uniqueId()}`,
    picks,
    scores,
    ...rest,
    fields,
  });
}

/**
 * A human character of `userId`'s on the seeded ruleset, written straight to the database: a Neutral Good man of 25,
 * 180 tall and 75 heavy, with no experience, unless `values` says otherwise (its race, its `race` link, `links.race`;
 * its experience, `xp`; its row's own columns), and no abilities, levels or activity. Create one with
 * `createCharacterAs` when the test needs those.
 */
export async function createTestCharacter(
  userId: string,
  {
    links,
    xp = 0,
    ...values
  }: Partial<Omit<Character, "fields" | "links">> & { links?: { race?: string }; xp?: number } = {},
) {
  const ctx = await getSeedCtx();
  const [character] = await Characters.create(db, {
    kind: PLAYER_CHARACTER_KIND,
    userId,
    rulesetId: ctx.rulesetId,
    name: `Test Character ${uniqueId()}`,
    ...values,
    fields: {
      [CHARACTER_AGE]: 25,
      [CHARACTER_ALIGNMENT]: "Neutral Good",
      [CHARACTER_GENDER]: "Male",
      [CHARACTER_HEIGHT]: "180",
      [CHARACTER_WEIGHT]: "75",
      [CHARACTER_XP]: xp,
    },
    links: { [RACE_ROLE]: links?.race ?? ctx.raceMap.pc["Human"] },
  });
  return character;
}

/**
 * A new character of the seed user's, created through the API: a Human on the seeded ruleset with every ability at 10,
 * unless `json` says otherwise.
 */
export async function postCharacter(
  json: Partial<InferRequestType<typeof api.api.characters.$post>["json"]> & NewFields & NewStart = {},
) {
  const ctx = await getSeedCtx();
  const { fields, rest: given } = splitFields(json);
  const { picks, scores, rest } = splitStart(given, {
    abilities: Object.fromEntries(Object.values(ctx.abilityMap).map((id) => [id, 10])),
    race: ctx.raceMap.pc["Human"],
  });
  const { rulesetId = ctx.rulesetId, name = `Test Character ${uniqueId()}`, ...others } = rest;
  return await expectOk(
    api.api.characters.$post({
      json: {
        picks,
        scores,
        ...others,
        fields,
        rulesetId,
        name,
      },
    }),
  );
}

/**
 * A 3.5 character's sheet (`characterId`'s, a bonded creature's built with its master), every part of it as its module
 * builds it (`CharacterResponse.buildSheet`): what its blocks show, as the rules hold it, which the API answers none
 * of.
 */
export async function sheetOf(characterId: string) {
  const record = await Characters.findOne(db, { id: characterId }, Visibility.All);
  if (!record) throw new Error(`No character ${characterId}`);
  const built = await buildCharacter(record);
  if (!(built instanceof DetailedCharacter)) throw new Error(`${record.name} doesn't build as a 3.5 character`);
  return CharacterResponse.buildBondedSheet(record, built);
}
