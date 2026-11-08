import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Entities } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import { getDnd5SeedCtx } from "@/tests/support/dnd5/seed.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

const session = makeSession();

/** The seed user's private fork of the seeded core rules, and its inherited class of this name. */
async function forkWithClass(name: string) {
  const { rulesetId } = await getDnd5SeedCtx();
  const fork = await RulesetsService.forkRuleset(session, rulesetId, { name: `Fork ${uniqueId()}`, private: true });
  const klass = (await Entities.findOne(db, { entityType: "classes", name, rulesetId: fork.rulesetId! }))!;
  return { fork, klass };
}

/** The tables a class's Spells tab leaves out, by their keys, as its progression's answer lists them. */
async function hiddenTablesOf(rulesetId: string, classId: string) {
  const answer = (await EntitiesService.getProgression(session, rulesetId, "classes", classId)) as unknown as {
    hiddenTables: string[];
  };
  return answer.hiddenTables;
}

/** A class's Pact Magic table (`classId`, in `rulesetId`): each level's slots and their level, by the level's number. */
async function pactByLevel(rulesetId: string, classId: string) {
  const rows = (await EntitiesService.getEntityTable(session, rulesetId, "classes", classId, "pact-magic")) as {
    id: string;
    pactMagic: Record<string, number>;
    position: number;
  }[];
  return new Map(rows.map((row) => [row.position, row]));
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
    const ctx = await getDnd5SeedCtx();
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

describe("A D&D 5th Edition class's Pact Magic table", () => {
  test("gives a warlock's slots and their level by each level, shown in place of its empty Spell Slots", async () => {
    const ctx = await getDnd5SeedCtx();
    const warlock = await pactByLevel(ctx.rulesetId, ctx.classMap["Warlock"]);
    expect(warlock.get(1)!.pactMagic).toEqual({ slots: 1, level: 1 });
    expect(warlock.get(3)!.pactMagic).toEqual({ slots: 2, level: 2 });
    expect(warlock.get(11)!.pactMagic).toEqual({ slots: 3, level: 5 });
    expect(warlock.get(20)!.pactMagic).toEqual({ slots: 4, level: 5 });
    // A warlock's tab shows Pact Magic, not Spell Slots it has none of; a wizard's, its Spell Slots alone
    expect(await hiddenTablesOf(ctx.rulesetId, ctx.classMap["Warlock"])).toEqual(["perDay"]);
    expect(await hiddenTablesOf(ctx.rulesetId, ctx.classMap["Wizard"])).toEqual(["pact"]);
    expect((await pactByLevel(ctx.rulesetId, ctx.classMap["Wizard"])).get(20)!.pactMagic).toEqual({});
  });

  test("saves a level's slots and slot level as its levels' increases, the others' totals kept", async () => {
    const { fork, klass } = await forkWithClass("Warlock");
    const before = await pactByLevel(fork.id, klass.id);
    // A fifth slot at the 20th level: only it changes
    await EntitiesService.updateProgression(session, fork.id, "classes", klass.id, {
      spells: { pact: [{ ownedId: before.get(20)!.id, counts: [5, 5] }] },
    });
    const after = await pactByLevel(fork.id, klass.id);
    expect(after.get(19)!.pactMagic).toEqual({ slots: 4, level: 5 });
    expect(after.get(20)!.pactMagic).toEqual({ slots: 5, level: 5 });
    // A slot level past the 9th is refused
    expect(
      EntitiesService.updateProgression(session, fork.id, "classes", klass.id, {
        spells: { pact: [{ ownedId: before.get(20)!.id, counts: [5, 10] }] },
      }),
    ).rejects.toMatchObject({ message: "Pact Magic's slot level is 9 at most" });
  });
});
