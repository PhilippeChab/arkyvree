import { describe, expect, test } from "bun:test";

import { eq, sql } from "drizzle-orm";

import { charactersInCharacter } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";
import { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";
import { CharacterModifiersService } from "@/server/services/characters/modifiers/index.ts";
import { backdateLastChange } from "@/tests/support/characters.ts";
import {
  createSeedCharacter,
  createWizardWithFamiliar,
  FIGHTER_LEVELS,
  levelUp,
} from "@/tests/support/dnd3.5/levelFixtures.ts";
import { createTestAttachment } from "@/tests/support/files.ts";
import { findPlainItem, getSeedCtx } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

const session = makeSession();

/** A character's last change and its update, as stored. */
async function datesOf(characterId: string) {
  const row = await db.query.charactersInCharacter.findFirst({
    columns: { lastChangedAt: true, updatedAt: true },
    where: eq(charactersInCharacter.id, characterId),
  });
  return row!;
}

/**
 * What `change` answers, once checked that it moves the character's last change, backdated first, to the test's
 * transaction's start (`transactionStart`), and leaves its `updatedAt`, the details form's stale-edit check, as it was.
 */
async function expectMoved<T>(characterId: string, change: () => Promise<T>) {
  await backdateLastChange(characterId);
  const before = await datesOf(characterId);
  const result = await change();
  expect(await datesOf(characterId)).toEqual({ lastChangedAt: await transactionStart(), updatedAt: before.updatedAt });
  return result;
}

/** When the test's transaction started, which every change it makes moves a character's last change to. */
async function transactionStart() {
  return (await db.execute<{ now: string }>(sql`select now()::text as now`)).rows[0].now;
}

describe("a character's last change", () => {
  test("moves with a level-up and the level's removal, so a details form opened before still saves", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx);
    const opened = await datesOf(characterId);

    await expectMoved(characterId, () => levelUp(session, ctx, characterId, "Fighter", 1, FIGHTER_LEVELS[0]));
    await expectMoved(characterId, () => CharacterLevelsService.removeLevel(session, characterId));

    // The form's copy is still the stored one, and a copy older than its save is refused
    await CharactersService.updateCharacter(session, characterId, { notes: "Saved", updatedAt: opened.updatedAt });
    expect(
      CharactersService.updateCharacter(session, characterId, { notes: "Stale", updatedAt: opened.updatedAt }),
    ).rejects.toThrow(ConflictError);
  });

  test("moves with an item added and removed", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx);
    const item = await findPlainItem(ctx.rulesetId);

    const entry = await expectMoved(characterId, () =>
      CharacterInventoryService.addItem(session, characterId, item.id, 1, false, null, null, null, null),
    );
    await expectMoved(characterId, () => CharacterInventoryService.removeItem(session, characterId, entry.id));
  });

  test("moves with an ability score and the languages", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx);

    await expectMoved(characterId, () =>
      CharactersService.updateAbilities(session, characterId, { [ctx.abilityMap["Strength"]]: 17 }),
    );
    await expectMoved(characterId, () =>
      CharactersService.updateLanguages(session, characterId, [ctx.langMap["Draconic"]]),
    );
  });

  test("moves with a modifier added and deleted, and with a portrait", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx);
    const bonus = { target: "abilities.strength.misc", value: "2", operator: "add" };

    const modifier = await expectMoved(characterId, () =>
      CharacterModifiersService.createModifier(session, characterId, bonus),
    );
    await expectMoved(characterId, () => CharacterModifiersService.deleteModifier(session, characterId, modifier.id));
    await expectMoved(characterId, () => createTestAttachment("portrait", characterId));
  });

  test("moves with the character's own details, as its updatedAt does", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx);
    await backdateLastChange(characterId);

    await CharactersService.updateCharacter(session, characterId, { notes: "Edited" });

    expect((await datesOf(characterId)).lastChangedAt).toBe(await transactionStart());
  });

  test("moves its master's with a bonded creature's change: the list shows the master, its sheet", async () => {
    const { masterId, bonded } = await createWizardWithFamiliar();

    await expectMoved(masterId, () => CharactersService.updateCharacter(session, bonded.id, { name: "Whiskers" }));
  });
});
