import { describe, expect, test } from "bun:test";
import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { db } from "@/server/database/index.ts";
import { generatePdfTask } from "@/server/jobs/generatePdf.tsx";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { Characters, Exports, Notifications } from "@/server/repositories/index.ts";
import { createTestCharacter, createTestUser, silentJobHelpers } from "@/tests/helpers.ts";

/** A seeded character of the seed user's, by name. */
async function seeded(name: string) {
  const { items } = await Characters.findMany(db, { userId: SEED_USER_ID, visibility: Visibility.UnarchivedOnly }, { limit: 100, page: 1 });
  return items.find((character) => character.name === name)!;
}

/** The notifications of `type` a user got, newest first. */
async function notificationsOf(userId: string, type: string) {
  const { items } = await Notifications.findMany(db, { recipientId: userId }, { limit: 50, page: 1 });
  return items.filter((n) => n.type === type);
}

describe("generatePdf", () => {
  // A fighter and a spellcaster, whose sheet has spell pages.
  test.each(["Bjorn Ironhand", "Elara Starweaver"])("stores %s's sheet as an export, and tells the player it's ready", async (name) => {
    const character = await seeded(name);
    await generatePdfTask({ userId: SEED_USER_ID, characterId: character.id, characterName: `${name}: Draft/1` }, silentJobHelpers);

    const [ready] = await notificationsOf(SEED_USER_ID, "pdfReady");
    expect(ready).toMatchObject({ targetTable: "exports", data: { characterId: character.id } });
    const pdf = await Exports.findOne(db, { id: ready.targetId, userId: SEED_USER_ID });
    // A file name keeps no path separator or colon.
    expect(pdf).toMatchObject({ type: "pdf", mimeType: "application/pdf", fileName: `${name}_ Draft_1-sheet.pdf` });
    expect(Buffer.from(pdf!.data).subarray(0, 5).toString()).toBe("%PDF-");
    expect(new Date(pdf!.expiresAt).getTime()).toBeGreaterThan(Date.now());
  }, 30_000);

  test("tells the player it failed when the character isn't theirs to export anymore", async () => {
    const { user } = await createTestUser();
    const { user: other } = await createTestUser();
    const character = await createTestCharacter(other.id);
    await generatePdfTask({ userId: user.id, characterId: character.id, characterName: character.name }, silentJobHelpers);

    expect(await notificationsOf(user.id, "pdfFailed")).toMatchObject([{ targetId: character.id, data: { characterName: character.name } }]);
    expect(await notificationsOf(user.id, "pdfReady")).toEqual([]);
  });
});
