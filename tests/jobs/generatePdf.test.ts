import { describe, expect, test } from "bun:test";

import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { generatePdfTask } from "@/server/jobs/generatePdf.ts";
import { Exports, Modifiers, Notifications, Requirements } from "@/server/repositories/index.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { createCharacterAs, createTestCharacter } from "@/tests/support/characters.ts";
import { buildAs } from "@/tests/support/dnd3.5/characters.ts";
import { queuedPdfJobs, silentJobHelpers } from "@/tests/support/jobs.ts";
import { findSeededCharacter } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** The notifications of `type` a user got, newest first. */
async function notificationsOf(userId: string, type: string) {
  const { items } = await Notifications.findPage(db, { recipientId: userId }, { limit: 50, page: 1 });
  return items.filter((n) => n.type === type);
}

describe("generatePdf", () => {
  // A fighter and a spellcaster, whose sheet has spell pages.
  test.each(["Bjorn Ironhand", "Elara Starweaver"])(
    "stores %s's sheet as an export, and tells the player it's ready",
    async (name) => {
      const character = await findSeededCharacter(name);
      await generatePdfTask(
        { userId: SEED_USER_ID, characterId: character.id, characterName: `${name}: Draft/1` },
        silentJobHelpers,
      );

      const [ready] = await notificationsOf(SEED_USER_ID, "pdfReady");
      expect(ready).toMatchObject({ targetTable: "exports", data: { characterId: character.id } });
      const pdf = await Exports.findOne(db, { id: ready.targetId, userId: SEED_USER_ID });
      // A file name keeps no path separator or colon.
      expect(pdf).toMatchObject({ type: "pdf", mimeType: "application/pdf", fileName: `${name}_ Draft_1-sheet.pdf` });
      expect(Buffer.from(pdf!.data!).subarray(0, 5).toString()).toBe("%PDF-");
      expect(new Date(pdf!.expiresAt).getTime()).toBeGreaterThan(Date.now());
    },
    30_000,
  );

  // Rules changes can leave a character's customizations pointing at what no longer exists.
  test("stores the sheet of a character whose customizations can't all apply, which lists them", async () => {
    const { user } = await createTestUser();
    const character = await createTestCharacter(user.id);
    const modifier = async (target: string) =>
      (
        await Modifiers.create(db, {
          sourceId: character.id,
          sourceType: "characters",
          target,
          value: "1",
          valueType: "number",
          operator: "add",
        })
      )[0];
    const requirement = (entityId: string, target: string, value: string) =>
      Requirements.create(db, {
        entityId,
        entityType: "modifiers",
        level: "1",
        target,
        value,
        valueType: "number",
        operator: "greater_than_or_equal",
      });

    // A weapon's own attack bonus, with no such weapon wielded; an ability the rules don't have
    await modifier("weapon.tohit.misc");
    await modifier("abilities.luck.misc");
    await requirement((await modifier("abilities.strength.misc")).id, "abilities.luck.total", "10");
    // More unmet requirements than the sheet lists
    for (let i = 0; i < 16; i++)
      await requirement((await modifier("skills.climb.misc")).id, "skills.climb.total", "40");

    const detailedCharacter = await buildAs(DetailedCharacter, character);
    const { inactiveModifiers, skippedModifiers } = detailedCharacter.modifierEvaluator.getModifiers();
    const { invalidRequirements, unmetRequirementGroups } = detailedCharacter.requirementEvaluator.getRequirements();
    expect(inactiveModifiers.map((m) => m.target)).toEqual(["weapon.tohit.misc"]);
    expect(skippedModifiers.map(({ modifier: m, warning }) => [m.target, warning])).toEqual([
      ["abilities.luck.misc", "Element not found: luck"],
    ]);
    expect(invalidRequirements.map(({ requirement: r, warning }) => [r.target, warning])).toEqual([
      ["abilities.luck.total", "Element not found: luck"],
    ]);
    expect(unmetRequirementGroups).toHaveLength(16);

    await generatePdfTask(
      { userId: user.id, characterId: character.id, characterName: character.name },
      silentJobHelpers,
    );
    const [ready] = await notificationsOf(user.id, "pdfReady");
    const pdf = await Exports.findOne(db, { id: ready.targetId, userId: user.id });
    expect(Buffer.from(pdf!.data!).subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);

  test("tells the player it failed when the character isn't theirs to export anymore", async () => {
    const { user } = await createTestUser();
    const { user: other } = await createTestUser();
    const character = await createTestCharacter(other.id);
    await generatePdfTask(
      { userId: user.id, characterId: character.id, characterName: character.name },
      silentJobHelpers,
    );

    expect(await notificationsOf(user.id, "pdfFailed")).toMatchObject([
      { targetId: character.id, data: { characterName: character.name } },
    ]);
    expect(await notificationsOf(user.id, "pdfReady")).toEqual([]);
  });

  test("fills in the export its request stored, pending, which then reads ready", async () => {
    const { session } = await createTestUser();
    const character = await createCharacterAs(session);
    const pending = await CharactersService.enqueuePdf(session, character.id);
    expect(pending).toMatchObject({ status: "pending", fileName: `${character.name}-sheet.pdf` });
    expect(pending).not.toHaveProperty("data");

    const [job] = await queuedPdfJobs(character.id);
    expect(job?.payload).toMatchObject({ exportId: pending.id });
    await generatePdfTask(job!.payload, silentJobHelpers);

    const ready = await Exports.findOne(db, { id: pending.id, userId: session.userId });
    expect(ready?.status).toBe("ready");
    expect(Buffer.from(ready!.data!).subarray(0, 5).toString()).toBe("%PDF-");
    expect(await notificationsOf(session.userId, "pdfReady")).toMatchObject([{ targetId: pending.id }]);
  }, 30_000);

  test("marks the export its request stored failed when the character can't be exported anymore", async () => {
    const { session } = await createTestUser();
    const character = await createCharacterAs(session);
    const pending = await CharactersService.enqueuePdf(session, character.id);
    await CharactersService.archiveCharacter(session, character.id);

    const [job] = await queuedPdfJobs(character.id);
    await generatePdfTask(job!.payload, silentJobHelpers);

    expect(await Exports.findOne(db, { id: pending.id, userId: session.userId })).toMatchObject({
      status: "failed",
      data: null,
    });
    expect(await notificationsOf(session.userId, "pdfFailed")).toMatchObject([{ data: { exportId: pending.id } }]);
  });

  test("keeps an export an earlier attempt stored ready when a retry can't export the character anymore", async () => {
    const { session } = await createTestUser();
    const character = await createCharacterAs(session);
    const pending = await CharactersService.enqueuePdf(session, character.id);
    const [job] = await queuedPdfJobs(character.id);
    await generatePdfTask(job!.payload, silentJobHelpers);

    // The worker died before the queue heard the job finished: its retry runs after the character's archived
    await CharactersService.archiveCharacter(session, character.id);
    await generatePdfTask(job!.payload, silentJobHelpers);

    expect((await Exports.findOne(db, { id: pending.id, userId: session.userId }))?.status).toBe("ready");
    expect(await notificationsOf(session.userId, "pdfFailed")).toEqual([]);
  }, 30_000);

  test("tells the user a PDF failed whose pending export the cleanup deleted before its job ran", async () => {
    const { session } = await createTestUser();
    const character = await createCharacterAs(session);
    const pending = await CharactersService.enqueuePdf(session, character.id);
    await CharactersService.archiveCharacter(session, character.id);
    await Exports.delete(db, { id: pending.id });

    const [job] = await queuedPdfJobs(character.id);
    await generatePdfTask(job!.payload, silentJobHelpers);
    const [notification] = await notificationsOf(session.userId, "pdfFailed");
    expect(notification?.data).not.toHaveProperty("exportId");
  });
});
