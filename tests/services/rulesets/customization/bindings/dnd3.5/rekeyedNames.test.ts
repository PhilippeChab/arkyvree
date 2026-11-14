import { afterAll, describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import { updateNameKeys } from "@/database/packages/nameBindings.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { NameBindingFill, RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { createTestPool } from "@/server/database/test.ts";
import { Locks, Modifiers, NameBindings, Requirements, Rulesets } from "@/server/repositories/index.ts";
import { CharacterModifiersService } from "@/server/services/characters/modifiers/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { runWhileLocked } from "@/tests/support/database.ts";
import { createTestCharacter, sheetOf } from "@/tests/support/dnd3.5/characters.ts";
import { createSeededTestRuleset, readView } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

const pool = createTestPool();

/**
 * A fork that calls Hide "Discrétion", whose rules name it: a feat's bonus to it, gated on its misc bonus, and a formula
 * reading it; a requirement on the feat; and a character's own bonus to it, who has the feat.
 */
async function setUp() {
  const { session, user } = await createTestUser();
  const fork = await createSeededTestRuleset(user.id);
  const hide = Dnd35View.of(await readView(fork.id)).skills.find((skill) => skill.name === "Hide")!;
  await EntitiesService.updateEntity(session, fork.id, "skills", hide.id, { name: "Discrétion" });
  const general = Dnd35View.of(await readView(fork.id)).aptitudes.find((aptitude) => aptitude.name === "General")!;
  const feat = await EntitiesService.createEntity(session, fork.id, "feats", {
    name: "Ombre",
    links: { listedIn: [{ toId: general.id }] },
  });
  const bonus = await ModifiersService.createModifier(session, fork.id, "feats", feat.id, {
    operator: "add",
    target: "skills.discrétion.misc",
    value: "2",
  });
  const formula = await ModifiersService.createModifier(session, fork.id, "feats", feat.id, {
    operator: "add",
    target: "abilities.strength.misc",
    value: "{{ floor(skills.discrétion.misc / 7) + [skills.discrétion.rank] }}",
  });
  const gate = await RequirementsService.createRequirement(session, fork.id, "modifiers", bonus.id, {
    level: "1",
    operator: "greater_than_or_equal",
    target: "skills.discrétion.misc",
    value: "5",
  });
  const prerequisite = await RequirementsService.createRequirement(session, fork.id, "feats", feat.id, {
    level: "1",
    operator: "greater_than_or_equal",
    target: "skills.discrétion.rank",
    value: "0",
  });
  const character = await createTestCharacter(user.id, { rulesetId: fork.id });
  await CharacterModifiersService.createModifier(session, character.id, {
    operator: "set",
    target: "feats.ombre.possessed",
    value: "true",
  });
  const own = await CharacterModifiersService.createModifier(session, character.id, {
    operator: "add",
    target: "skills.discrétion.misc",
    value: "5",
  });
  return {
    character,
    fork,
    modifierIds: [bonus.id, formula.id, own.id],
    requirementIds: [gate.id, prerequisite.id],
  };
}

/** The rows' text as stored, and their bindings. */
async function storedOf({ modifierIds, requirementIds }: { modifierIds: string[]; requirementIds: string[] }) {
  const texts: (string | null)[][] = [];
  for (const id of modifierIds) {
    const { target, value } = (await Modifiers.findOne(db, { id }))!;
    texts.push([target, value]);
  }
  for (const id of requirementIds) {
    const { target, value } = (await Requirements.findOne(db, { id }))!;
    texts.push([target, value]);
  }
  return { bindings: await NameBindings.findMany(db, { modifierIds, requirementIds }), texts };
}

/** Writes the rows' text back as it was saved before keys kept accented letters, straight in the database. */
async function writeOldKeys(rulesetId: string) {
  for (const table of [sql`customization.modifiers`, sql`customization.requirements`]) {
    await db.execute(sql`
      update ${table}
      set target = replace(target, 'discrétion', 'discrtion'), value = replace(value, 'discrétion', 'discrtion')
      where target like '%discrétion%' or value like '%discrétion%'
    `);
  }
  RulesetViews.invalidate(rulesetId);
}

describe("a rule saved before a name's key kept its accented letters", () => {
  test("is read as the new key until the rekey rewrites it, which a second run leaves, its bindings and sheet unchanged", async () => {
    const rows = await setUp();
    const { character, fork } = rows;
    const sheet = await sheetOf(character.id);
    const saved = await storedOf(rows);
    expect(saved.texts).toEqual([
      ["skills.discrétion.misc", "2"],
      ["abilities.strength.misc", "{{ floor(skills.discrétion.misc / 7) + [skills.discrétion.rank] }}"],
      ["skills.discrétion.misc", "5"],
      ["skills.discrétion.misc", "5"],
      ["skills.discrétion.rank", "0"],
    ]);
    // Each name, a formula's bare and bracketed paths among them, is bound to the skill
    const named = saved.bindings.filter((binding) => binding.kind === "entity" && binding.name === "Discrétion");
    expect(named.map(({ field, path }) => `${field} ${path}`).toSorted()).toEqual([
      "target 0",
      "target 0",
      "target 0",
      "target 0",
      "value 0",
      "value 1",
    ]);

    await writeOldKeys(fork.id);
    expect((await storedOf(rows)).texts.map(([target]) => target)).toContain("skills.discrtion.misc");

    // Between the deploy and the rekey: the sheet reads the old text as the new, and a fill keeps the bindings
    expect(await sheetOf(character.id)).toEqual(sheet);
    expect((await NameBindingFill.fill(db, fork.id)).dropped).toBe(0);
    expect((await storedOf(rows)).bindings).toEqual(saved.bindings);

    const before = (await Rulesets.findVersions(db, { ids: [fork.id] })).get(fork.id)!;
    const first = await updateNameKeys(db, [fork.id]);
    RulesetViews.invalidate(fork.id);

    expect(await storedOf(rows)).toEqual(saved);
    expect(first.rewritten).toBe(5);
    expect(first.failed).toEqual([]);
    expect((await Rulesets.findVersions(db, { ids: [fork.id] })).get(fork.id)).toBe(before + 1);
    expect(await sheetOf(character.id)).toEqual(sheet);
    expect((await NameBindingFill.fill(db, fork.id)).dropped).toBe(0);

    const second = await updateNameKeys(db, [fork.id]);
    expect([second.rewritten, second.groups, second.rulesets]).toEqual([0, 0, 0]);
    expect((await Rulesets.findVersions(db, { ids: [fork.id] })).get(fork.id)).toBe(before + 1);
  });

  test("with no binding, is rewritten to the key of the one name that had its old key", async () => {
    const rows = await setUp();
    const { character, fork } = rows;
    const sheet = await sheetOf(character.id);
    const saved = await storedOf(rows);
    await writeOldKeys(fork.id);
    await db.execute(sql`delete from customization.name_bindings where requirement_id = ${rows.requirementIds[0]}`);

    await updateNameKeys(db, [fork.id]);
    RulesetViews.invalidate(fork.id);

    expect((await storedOf(rows)).texts).toEqual(saved.texts);
    expect(await sheetOf(character.id)).toEqual(sheet);
  });

  test("waits for a write that holds its ruleset before it locks any row, as every write does: no deadlock", async () => {
    const { rulesetId } = await getSeedCtx();
    const held = await db.execute<{ id: string }>(sql`
      select modifiers.id from customization.modifiers join rules.entities on entities.id = modifiers.source_id
      where entities.ruleset_id = ${rulesetId} limit 1
    `);
    let waitedAt = "";

    const update = await runWhileLocked(
      pool,
      (blockerDb) => Locks.lockRulesetContent(blockerDb, rulesetId),
      () => updateNameKeys(db, [rulesetId]),
      async ({ blockerDb, waiting }) => {
        waitedAt = waiting;
        // The write goes on to a row of the ruleset's, which the rekey holds none of while it waits
        await blockerDb.execute(sql`update customization.modifiers set value = value where id = ${held.rows[0].id}`);
      },
    );

    expect(waitedAt).toContain('rules"."rulesets');
    expect(update.failed).toEqual([]);
  });
});

afterAll(() => pool.end());
