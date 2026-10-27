import { describe, expect, test } from "bun:test";

import { eq, sql } from "drizzle-orm";

import { charactersInCharacter } from "@/drizzle/schema.ts";
import StorageEngine from "@/engine/api/StorageEngine.ts";
import { RACE_ROLE } from "@/engine/rulesets/dnd3.5/characters/CharacterValues.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { Characters, Visibility } from "@/server/repositories/index.ts";
import StoredCharacters from "@/server/repositories/stored/StoredCharacters.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { CHARACTER_FLAG_AND_SET, modulesWithCharacterFlagAndSet, modulesWithSecond } from "@/tests/support/modules.ts";
import { getSeedCtx, uniqueId } from "@/tests/support/seed.ts";
import { PLAYER_CHARACTER_KIND } from "@/vocabulary/dnd3.5/bondedKinds.ts";
import {
  CHARACTER_ALIGNMENT,
  CHARACTER_DEITY,
  CHARACTER_GENDER,
  CHARACTER_XP,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** A character's `character.fields` rows of a field (`field`), as stored, in their order. */
async function findFieldRows(characterId: string, field: string) {
  const { rows } = await db.execute(
    sql`select ordinal, value_kind, multiple, text_value, flag_value from character.fields where character_id = ${characterId} and field = ${field} order by ordinal`,
  );
  return rows;
}

/**
 * Registers the field definitions of a made-up module's flag and set on characters (`CHARACTER_FLAG_AND_SET`) in the
 * test's transaction, which the rows' foreign keys check them against.
 */
async function registerFlagAndSet() {
  const { retired, titles } = CHARACTER_FLAG_AND_SET;
  await db.execute(
    sql`insert into rules.field_defs (owner_kind, owner_type, field, value_kind, multiple) values ('character', 'characters', ${retired.field}, 'flag', false), ('character', 'characters', ${titles.field}, 'text', true)`,
  );
}

describe("A character's fields", () => {
  test("reads a number as stored, the largest it holds exactly too, and refuses one past it", async () => {
    const { id } = await createTestCharacter(SEED_USER_ID);
    await StoredCharacters.write(db, [id], { fields: { CHARACTER_XP: Number.MAX_SAFE_INTEGER } });

    const character = await Characters.findOne(db, { id }, Visibility.All);
    expect(character?.fields.CHARACTER_XP).toBe(Number.MAX_SAFE_INTEGER);
    for (const xp of [1e21, Number.MAX_SAFE_INTEGER + 1]) {
      const refused = await db
        .transaction((tx) => StoredCharacters.write(tx, [id], { fields: { CHARACTER_XP: xp } }))
        .catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(Error);
    }
  });

  test("refuses a value of another kind than its field's, and a field no module declares", async () => {
    const { id } = await createTestCharacter(SEED_USER_ID);
    const writing = (fields: Record<string, unknown>) =>
      db.transaction((tx) => StoredCharacters.write(tx, [id], { fields } as never)).catch((error: unknown) => error);

    expect(await writing({ CHARACTER_XP: "1500" })).toBeInstanceOf(Error);
    expect(await writing({ CHARACTER_XP: Number.NaN })).toBeInstanceOf(Error);
    expect(await writing({ CHARACTER_XP: true })).toBeInstanceOf(Error);
    expect(await writing({ CHARACTER_DEITY: 3 })).toBeInstanceOf(Error);
    expect(await writing({ NOT_A_FIELD: "x" })).toBeInstanceOf(Error);
  });

  test("clears a field written null", async () => {
    const { id } = await createTestCharacter(SEED_USER_ID);
    await StoredCharacters.write(db, [id], { fields: { CHARACTER_DEITY: "Pelor" } });
    await StoredCharacters.write(db, [id], { fields: { CHARACTER_DEITY: null } });

    const character = await Characters.findOne(db, { id }, Visibility.All);
    expect(character?.fields).not.toHaveProperty("CHARACTER_DEITY");
  });

  test("writes the default of a field always written that a new character leaves out, or a write clears", async () => {
    const { rulesetId, raceMap } = await getSeedCtx();
    const [created] = await Characters.create(db, {
      kind: PLAYER_CHARACTER_KIND,
      userId: SEED_USER_ID,
      rulesetId,
      name: `Test Character ${uniqueId()}`,
      fields: { [CHARACTER_DEITY]: "Pelor" },
      links: { [RACE_ROLE]: raceMap.pc["Human"] },
    });
    expect(created.fields).toEqual({
      [CHARACTER_ALIGNMENT]: "True Neutral",
      [CHARACTER_XP]: 0,
      [CHARACTER_DEITY]: "Pelor",
      [CHARACTER_GENDER]: "Other",
    });

    const { id } = await createTestCharacter(SEED_USER_ID, { xp: 300 });
    await StoredCharacters.write(db, [id], {
      fields: { [CHARACTER_ALIGNMENT]: null, [CHARACTER_GENDER]: "", [CHARACTER_XP]: null },
    });
    const character = await Characters.findOne(db, { id }, Visibility.All);
    expect(character?.fields).toMatchObject({
      [CHARACTER_ALIGNMENT]: "True Neutral",
      [CHARACTER_GENDER]: "Other",
      [CHARACTER_XP]: 0,
    });
  });

  test("reads a flag's value and a set's values, by ordinal, off their rows", async () => {
    const { id } = await createTestCharacter(SEED_USER_ID);
    await registerFlagAndSet();
    await db.execute(
      sql`insert into character.fields (character_id, field, ordinal, value_kind, multiple, flag_value) values (${id}, 'TEST_RETIRED', 0, 'flag', false, false)`,
    );
    await db.execute(
      sql`insert into character.fields (character_id, field, ordinal, value_kind, multiple, text_value) values (${id}, 'TEST_TITLES', 0, 'text', true, 'Sir'), (${id}, 'TEST_TITLES', 1, 'text', true, 'Dame')`,
    );

    const character = await Characters.findOne(db, { id }, Visibility.All);
    expect(character?.fields).toMatchObject({ TEST_RETIRED: false, TEST_TITLES: ["Dame", "Sir"] });
  });

  test("writes a new character's fields always written as its own module declares them, not another's", async () => {
    const { id } = await createTestCharacter(SEED_USER_ID);
    await registerFlagAndSet();
    // Another module's characters declare the flag, always written: a new 3.5 character holds none of it
    const beside = new StorageEngine(modulesWithSecond({ characters: CHARACTER_FLAG_AND_SET }));
    await StoredCharacters.write(db, [id], {}, true, beside);
    expect(await findFieldRows(id, "TEST_RETIRED")).toEqual([]);
    expect(await findFieldRows(id, CHARACTER_XP)).not.toEqual([]);
    // Its own module's do: it holds its default
    await StoredCharacters.write(db, [id], {}, true, new StorageEngine(modulesWithCharacterFlagAndSet()));
    expect(await findFieldRows(id, "TEST_RETIRED")).toEqual([
      { ordinal: 0, value_kind: "flag", multiple: false, text_value: null, flag_value: false },
    ]);
  });

  test("writes and reads a flag and a set its module declares, each row as the table's checks take it", async () => {
    const storage = new StorageEngine(modulesWithCharacterFlagAndSet());
    const { id } = await createTestCharacter(SEED_USER_ID);
    await registerFlagAndSet();
    await StoredCharacters.write(db, [id], { fields: { TEST_TITLES: ["Lord", "Sir", "Lord"] } }, false, storage);
    // Always written: false is a value of its own, in the flag's column
    await StoredCharacters.write(db, [id], { fields: { TEST_RETIRED: false } }, false, storage);

    expect(await findFieldRows(id, "TEST_RETIRED")).toEqual([
      { ordinal: 0, value_kind: "flag", multiple: false, text_value: null, flag_value: false },
    ]);
    expect(await findFieldRows(id, "TEST_TITLES")).toEqual([
      { ordinal: 0, value_kind: "text", multiple: true, text_value: "Lord", flag_value: null },
      { ordinal: 1, value_kind: "text", multiple: true, text_value: "Sir", flag_value: null },
    ]);
    const [row] = await db
      .select(StoredCharacters.buildColumns())
      .from(charactersInCharacter)
      .where(eq(charactersInCharacter.id, id));
    // A set's values in their declared order
    expect(StoredCharacters.toCharacter(row, storage).fields).toMatchObject({
      TEST_RETIRED: false,
      TEST_TITLES: ["Sir", "Lord"],
    });

    // A set holds a value once (`fields_set_value_idx`); a single field one value
    const twice = await db
      .transaction((tx) =>
        tx.execute(
          sql`insert into character.fields (character_id, field, ordinal, value_kind, multiple, text_value) values (${id}, 'TEST_TITLES', 2, 'text', true, 'Sir')`,
        ),
      )
      .catch((error: unknown) => error);
    expect(twice).toBeInstanceOf(Error);
    const several = await db
      .transaction((tx) =>
        StoredCharacters.write(tx, [id], { fields: { TEST_RETIRED: [true, false] } }, false, storage),
      )
      .catch((error: unknown) => error);
    expect(several).toBeInstanceOf(Error);
  });
});
