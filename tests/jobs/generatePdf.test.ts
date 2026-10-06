import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { db } from "@/server/database/index.ts";
import { generatePdfTask } from "@/server/jobs/generatePdf.tsx";
import { Exports, Modifiers, Notifications, Requirements } from "@/server/repositories/index.ts";
import Dnd35DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import { createTestCharacter } from "@/tests/support/characters.ts";
import { silentJobHelpers } from "@/tests/support/jobs.ts";
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
      expect(Buffer.from(pdf!.data).subarray(0, 5).toString()).toBe("%PDF-");
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

    const module = await RulesetFactory.fromRulesetId(character.rulesetId);
    const { detailedCharacter } = await module.createDetailedCharacterWithSheet(character, "pc");
    if (!(detailedCharacter instanceof Dnd35DetailedCharacter)) throw new Error("Not a D&D 3.5 character");
    const { inactiveModifiers, skippedModifiers } = detailedCharacter.getDetailedCharacterModifiers().getModifiers();
    const { invalidRequirements, unmetRequirementGroups } = detailedCharacter
      .getDetailedCharacterRequirements()
      .getRequirements();
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
    expect(Buffer.from(pdf!.data).subarray(0, 5).toString()).toBe("%PDF-");
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
});
