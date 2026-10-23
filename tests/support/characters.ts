import { eq, or } from "drizzle-orm";
import type { InferRequestType } from "hono/client";

import type { Db } from "@/drizzle/database.ts";
import { charactersInCharacter } from "@/drizzle/schema.ts";
import { CharacterInputs, type FieldsRequest, type SheetBlock } from "@/engine/core/module/index.ts";
import CharacterProjection from "@/engine/rulesets/dnd3.5/levelUp/CharacterProjection.ts";
import Dnd35CharacterBuilder from "@/engine/rulesets/dnd3.5/model/Dnd35CharacterBuilder.ts";
import { type RulesetScope, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Characters } from "@/server/repositories/index.ts";
import { CharactersService, readCharacterInput } from "@/server/services/characters/index.ts";
import type { Alignment, Gender } from "@/shared/enums.ts";
import type { Character, Session } from "@/shared/relations.ts";

import { api, expectOk } from "./api.ts";
import { getSeedCtx, uniqueId } from "./seed.ts";

/** A new character's fields, past those every character has, as the seeded ruleset's form sends them (3.5's). */
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
 * A test character's fields, unless it's given its own: a True Neutral man of 25, 180 tall and 80 heavy, with no
 * experience.
 */
const NEW_FIELDS = { age: 25, alignment: "True Neutral", gender: "Male", height: "180", weight: "80", xp: 0 };

/**
 * A new character's request split: its fields (3.5's form's, by their keys: a True Neutral man of 25, 180 tall and 80
 * heavy, with no experience, unless given), sent under `fields`, and the rest as it is.
 */
function splitFields<T extends NewFields & { fields?: FieldsRequest }>(values: T) {
  const { age, alignment, deity, description, fields, gender, height, weight, xp, ...rest } = values;
  const given = { age, alignment, deity, description, gender, height, weight, xp };
  return {
    fields: {
      ...NEW_FIELDS,
      ...Object.fromEntries(Object.entries(given).filter(([, value]) => value !== undefined)),
      ...fields,
    } as FieldsRequest,
    rest,
  };
}

/** The notes a sheet's identity block holds: its public ones, and its private ones for a reader who reads them. */
export function notesOf(sheet: { blocks: SheetBlock[] }) {
  const identity = sheet.blocks.find((block) => block.key === "identity");
  if (identity?.kind !== "fields") throw new Error("no identity block");
  return identity.notes;
}

/** The subsheets a sheet's entries hold: its bonded creatures', each in the details of the entry that bonds it. */
export function subsheetsOf(sheet: { blocks: SheetBlock[] }) {
  return sheet.blocks.flatMap((block) =>
    block.kind === "entries"
      ? block.entries.flatMap((entry) => (entry.subsheet ? [{ entryId: entry.id, id: entry.subsheet.id }] : []))
      : [],
  );
}

/**
 * Moves a character's last change, and its bonded creatures', back to `at`, long before any test, writing it alone
 * (the database keeps what such a write sets): a test's writes all run at its transaction's start, so a change the test
 * makes then moves the character past `at`.
 */
export async function backdateLastChange(characterId: string, at = "2000-01-01T00:00:00Z") {
  await db
    .update(charactersInCharacter)
    .set({ lastChangedAt: at })
    .where(or(eq(charactersInCharacter.id, characterId), eq(charactersInCharacter.parentCharacterId, characterId)));
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
  values: Partial<Parameters<typeof CharactersService.createCharacter>[1]> & NewFields = {},
) {
  const { rulesetId, raceMap } = await getSeedCtx();
  const { fields, rest } = splitFields(values);
  return await CharactersService.createCharacter(session, {
    rulesetId,
    raceId: raceMap.pc["Human"],
    name: `Test Character ${uniqueId()}`,
    abilities: {},
    ...rest,
    fields,
  });
}

/**
 * A human character of `userId`'s on the seeded ruleset, written straight to
 * the database: no abilities, levels or activity. Create one with
 * `createCharacterAs` when the test needs those.
 */
export async function createTestCharacter(userId: string, values: Partial<Character> = {}) {
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
export async function postCharacter(
  json: Partial<InferRequestType<typeof api.api.characters.$post>["json"]> & NewFields = {},
) {
  const ctx = await getSeedCtx();
  const { fields, rest } = splitFields(json);
  const { rulesetId = ctx.rulesetId, name = `Test Character ${uniqueId()}`, ...others } = rest;
  return await expectOk(
    api.api.characters.$post({
      json: {
        raceId: ctx.raceMap.pc["Human"],
        abilities: Object.fromEntries(Object.values(ctx.abilityMap).map((id) => [id, 10])),
        ...others,
        fields,
        rulesetId,
        name,
      },
    }),
  );
}
