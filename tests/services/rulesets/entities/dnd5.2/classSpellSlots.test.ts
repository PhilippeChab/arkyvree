import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Entities } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import { getDnd52SeedCtx } from "@/tests/support/dnd5.2/seed.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

const session = makeSession();

/** The seed user's private fork of the seeded core rules, and its inherited class of this name. */
async function forkWithClass(name: string) {
  const { rulesetId } = await getDnd52SeedCtx();
  const fork = await RulesetsService.forkRuleset(session, rulesetId, { name: `Fork ${uniqueId()}`, private: true });
  const klass = (await Entities.findOne(db, { entityType: "classes", name, rulesetId: fork.rulesetId! }))!;
  return { fork, klass };
}

/** A class's Spell Slots table (`classId`, in `rulesetId`): each level's slots by spell level, by the level's number. */
async function slotsByLevel(rulesetId: string, classId: string) {
  const rows = (await EntitiesService.getEntityTable(session, rulesetId, "classes", classId, "spells")) as {
    id: string;
    position: number;
    spellsPerDay: Record<string, number>;
  }[];
  return new Map(rows.map((row) => [row.position, row]));
}

describe("A D&D 5th Edition class's Spell Slots table", () => {
  test("gives each level's slots, its SRD table's, from spell level 1", async () => {
    const ctx = await getDnd52SeedCtx();
    const wizard = await slotsByLevel(ctx.rulesetId, ctx.classMap["Wizard"]);
    expect(wizard.get(1)!.spellsPerDay).toEqual({ 1: 2 });
    expect(wizard.get(3)!.spellsPerDay).toEqual({ 1: 4, 2: 2 });
    expect(wizard.get(20)!.spellsPerDay).toEqual({ 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 });
    // A paladin's, a half caster's, from its first level
    const paladin = await slotsByLevel(ctx.rulesetId, ctx.classMap["Paladin"]);
    expect(paladin.get(1)!.spellsPerDay).toEqual({ 1: 2 });
    expect(paladin.get(5)!.spellsPerDay).toEqual({ 1: 4, 2: 2 });
  });

  test("saves a level's slots as the table's columns give them, its first spell level 1", async () => {
    const { fork, klass } = await forkWithClass("Paladin");
    const before = await slotsByLevel(fork.id, klass.id);
    // Two level 2 slots from the 4th level, a column from spell level 1: the 2nd column is level 2
    await EntitiesService.updateProgression(session, fork.id, "classes", klass.id, {
      spells: { perDay: [{ ownedId: before.get(4)!.id, counts: [3, 2] }] },
    });
    const after = await slotsByLevel(fork.id, klass.id);
    expect(after.get(3)!.spellsPerDay).toEqual({ 1: 3 });
    expect(after.get(4)!.spellsPerDay).toEqual({ 1: 3, 2: 2 });
    expect(after.get(5)!.spellsPerDay).toEqual({ 1: 4, 2: 2 });
  });
});
