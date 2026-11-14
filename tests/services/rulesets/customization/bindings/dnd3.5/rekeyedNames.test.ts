import { afterAll, describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import { updateNameKeys } from "@/database/packages/nameBindings.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { NameBindingFill, RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { createTestPool } from "@/server/database/test.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Entities, Locks, Modifiers, NameBindings, Requirements, Rulesets } from "@/server/repositories/index.ts";
import { CharacterModifiersService } from "@/server/services/characters/modifiers/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { runWhileLocked } from "@/tests/support/database.ts";
import { createTestCharacter, sheetOf } from "@/tests/support/dnd3.5/characters.ts";
import { createSeededTestRuleset, readView } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { DND35_BASE_RULES } from "@/vocabulary/dnd3.5/baseRules.ts";

const pool = createTestPool();

/**
 * A fork that calls Hide "Discrétion", whose rules name it: a feat's bonus to it, gated on its misc bonus, and a formula
 * reading it; a requirement on the feat; another feat's bonus to a family of the fork's own skills, "Représentation"
 * (a group: no skill has its name); and a character's own bonus to it, who has the first feat.
 */
async function setUp() {
  const { session, user } = await createTestUser();
  const fork = await createSeededTestRuleset(user.id);
  const { abilityMap } = await getSeedCtx();
  const hide = Dnd35View.of(await readView(fork.id)).skills.find((skill) => skill.name === "Hide")!;
  await EntitiesService.updateEntity(session, fork.id, "skills", hide.id, { name: "Discrétion" });
  for (const name of ["Représentation (Chant)", "Représentation (Danse)"]) {
    await EntitiesService.createEntity(session, fork.id, "skills", {
      name,
      links: { keyAbility: abilityMap.Charisma },
    });
  }
  const general = Dnd35View.of(await readView(fork.id)).aptitudes.find((aptitude) => aptitude.name === "General")!;
  const feat = await EntitiesService.createEntity(session, fork.id, "feats", {
    name: "Ombre",
    links: { listedIn: [{ toId: general.id }] },
  });
  const bonus = await ModifiersService.createModifier(session, fork.id, "feats", feat.id, {
    operator: "add",
    target: "skills.discretion.misc",
    value: "2",
  });
  const formula = await ModifiersService.createModifier(session, fork.id, "feats", feat.id, {
    operator: "add",
    target: "abilities.strength.misc",
    value: "{{ floor(skills.discretion.misc / 7) + [skills.discretion.rank] }}",
  });
  // A feat the character doesn't have: its family's text, bound to no skill, waits for the rekey to be read
  const singer = await EntitiesService.createEntity(session, fork.id, "feats", {
    name: "Chanteur",
    links: { listedIn: [{ toId: general.id }] },
  });
  const family = await ModifiersService.createModifier(session, fork.id, "feats", singer.id, {
    operator: "add",
    target: "skills.representation.misc",
    value: "1",
  });
  const gate = await RequirementsService.createRequirement(session, fork.id, "modifiers", bonus.id, {
    level: "1",
    operator: "greater_than_or_equal",
    target: "skills.discretion.misc",
    value: "5",
  });
  const prerequisite = await RequirementsService.createRequirement(session, fork.id, "feats", feat.id, {
    level: "1",
    operator: "greater_than_or_equal",
    target: "skills.discretion.rank",
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
    target: "skills.discretion.misc",
    value: "5",
  });
  return {
    character,
    fork,
    modifierIds: [bonus.id, formula.id, family.id, own.id],
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
  // In a fixed order, as the database returns them in none
  const bindings = (await NameBindings.findMany(db, { modifierIds, requirementIds })).toSorted((a, b) =>
    a.id.localeCompare(b.id),
  );
  return { bindings, texts };
}

/**
 * Writes the rows' text back as it was saved while keys left accented letters out, straight in the database, and the
 * family's group binding under its old key, as a save then bound it.
 */
async function writeOldKeys(rulesetId: string) {
  for (const [key, old] of [
    ["discretion", "discrtion"],
    ["representation", "reprsentation"],
  ]) {
    for (const table of [sql`customization.modifiers`, sql`customization.requirements`]) {
      await db.execute(sql`
        update ${table}
        set target = replace(target, ${key}, ${old}), value = replace(value, ${key}, ${old})
        where target like ${`%${key}%`} or value like ${`%${key}%`}
      `);
    }
  }
  await db.execute(sql`
    update customization.name_bindings set name = 'reprsentation' where name = 'representation' and kind = 'group'
  `);
  RulesetViews.invalidate(rulesetId);
}

describe("a rule saved while a name's key left its accented letters out", () => {
  test("is read as the new key until the rekey rewrites it, which a second run leaves, its bindings and sheet unchanged", async () => {
    const rows = await setUp();
    const { character, fork } = rows;
    const sheet = await sheetOf(character.id);
    const saved = await storedOf(rows);
    expect(saved.texts).toEqual([
      ["skills.discretion.misc", "2"],
      ["abilities.strength.misc", "{{ floor(skills.discretion.misc / 7) + [skills.discretion.rank] }}"],
      ["skills.representation.misc", "1"],
      ["skills.discretion.misc", "5"],
      ["skills.discretion.misc", "5"],
      ["skills.discretion.rank", "0"],
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
    // The family, which no skill's name is, is bound as a group under its key
    expect(saved.bindings.filter((binding) => binding.kind === "group").map(({ name }) => name)).toEqual([
      "representation",
    ]);

    await writeOldKeys(fork.id);
    const old = await storedOf(rows);
    expect(old.texts.map(([target]) => target)).toEqual([
      "skills.discrtion.misc",
      "abilities.strength.misc",
      "skills.reprsentation.misc",
      "skills.discrtion.misc",
      "skills.discrtion.misc",
      "skills.discrtion.rank",
    ]);
    expect(old.bindings.filter((binding) => binding.kind === "group").map(({ name }) => name)).toEqual([
      "reprsentation",
    ]);

    // Between the deploy and the rekey: the sheet reads the old text bound to its skill as the new, and a fill keeps
    // the bindings
    expect(await sheetOf(character.id)).toEqual(sheet);
    expect((await NameBindingFill.fill(db, fork.id)).dropped).toBe(0);
    expect((await storedOf(rows)).bindings).toEqual(old.bindings);

    const before = (await Rulesets.findVersions(db, { ids: [fork.id] })).get(fork.id)!;
    const first = await updateNameKeys(db, [fork.id]);
    RulesetViews.invalidate(fork.id);

    expect(await storedOf(rows)).toEqual(saved);
    // Its six rows, and the bonuses of the Skill Focus feats the two new skills made, which name them
    expect([first.rewritten, first.groups, first.unsettled, first.clashes]).toEqual([8, 1, [], []]);
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

  test("whose old key would move to a key two feats now share, is left as it is, and listed with both", async () => {
    const { session, user } = await createTestUser();
    const fork = await createSeededTestRuleset(user.id);
    const general = Dnd35View.of(await readView(fork.id)).aptitudes.find((aptitude) => aptitude.name === "General")!;
    const feat = (name: string) =>
      EntitiesService.createEntity(session, fork.id, "feats", { name, links: { listedIn: [{ toId: general.id }] } });
    await feat("Côte");
    const holder = await feat("Gizmo Holder");
    const grant = await ModifiersService.createModifier(session, fork.id, "feats", holder.id, {
      operator: "set",
      target: "feats.cote.possessed",
      value: "true",
    });
    // A "Cote" saved while its key told it apart from "Côte"'s ("cte" then), which a save refuses now
    expect(feat("Cote")).rejects.toEqual(
      new ConflictError(
        '"Cote" and "Côte" read as one name to the rules: they differ only in case, accents, spaces or signs',
      ),
    );
    await Entities.create(db, DND35_BASE_RULES, "feats", { name: "Cote", description: "", rulesetId: fork.id });
    await db.execute(sql`update customization.modifiers set target = 'feats.cte.possessed' where id = ${grant.id}`);
    RulesetViews.invalidate(fork.id);

    const update = await updateNameKeys(db, [fork.id]);

    expect((await Modifiers.findOne(db, { id: grant.id }))?.target).toBe("feats.cte.possessed");
    expect(update.rewritten).toBe(0);
    expect(
      update.unsettled.map(({ held, keys, names, rowId }) => ({ held, keys, names: names?.toSorted(), rowId })),
    ).toEqual([{ held: "cte", keys: ["cote"], names: ["Cote", "Côte"], rowId: grant.id }]);
    expect(update.clashes.map(({ entityType, key, names }) => ({ entityType, key, names: names.toSorted() }))).toEqual([
      { entityType: "feats", key: "cote", names: ["Cote", "Côte"] },
    ]);
  });

  test("locks a bonded creature's master before it, whose modifier it rewrites, as every write does: no deadlock", async () => {
    // A seeded bonded creature, and its master, which another connection can lock; its ruleset calls Hide "Discrétion"
    const { rulesetId, skillMap } = await getSeedCtx();
    const bonded = await db.execute<{ id: string; master: string }>(sql`
      select id, parent_character_id as master from character.characters
      where ruleset_id = ${rulesetId} and parent_character_id is not null order by id limit 1
    `);
    const { id: creatureId, master } = bonded.rows[0];
    await db.execute(sql`update rules.entities set name = 'Discrétion' where id = ${skillMap.Hide}`);
    // Written without touching the master, which another connection then couldn't lock past this test's transaction
    await db.execute(sql`select set_config('arkyvree.registry_sync', 'on', true)`);
    const own = await db.execute<{ id: string }>(sql`
      insert into customization.modifiers (source_id, source_type, target, value, value_type, operator)
      values (${creatureId}, 'characters', 'skills.discrtion.misc', '5', 'number', 'add') returning id
    `);
    await db.execute(sql`select set_config('arkyvree.registry_sync', 'off', true)`);
    RulesetViews.invalidate(rulesetId);
    // The ruleset's view composed once, so the rekey reaches its locks within the wait the check allows
    await readView(rulesetId);
    RulesetViews.invalidate(rulesetId);
    let waitedAt = "";

    // A write of the master holds it: the rekey waits for it before it writes the creature's modifier, which touches it
    const update = await runWhileLocked(
      pool,
      (blockerDb) => Locks.lockCharacters(blockerDb, { ids: [master] }, "update"),
      () => updateNameKeys(db, [rulesetId]),
      ({ waiting }) => {
        waitedAt = waiting;
      },
    );

    expect(waitedAt).toContain('"character"."characters"');
    expect(waitedAt).toContain("for no key update");
    expect(update.failed).toEqual([]);
    expect((await Modifiers.findOne(db, { id: own.rows[0].id }))?.target).toBe("skills.discretion.misc");
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
