import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { Characters, Visibility } from "@/server/repositories/index.ts";
import StoredCharacters from "@/server/repositories/stored/StoredCharacters.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";

describe("A character's fields", () => {
  test("reads a number as stored, 1e21 or more too", async () => {
    const { id } = await createTestCharacter(SEED_USER_ID);
    await StoredCharacters.write(db, [id], { fields: { CHARACTER_XP: 1e21 } });

    const character = await Characters.findOne(db, { id }, Visibility.All);
    expect(character?.fields.CHARACTER_XP).toBe(1e21);
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
});
