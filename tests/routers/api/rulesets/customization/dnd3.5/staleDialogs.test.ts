import { describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { NameBindings } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import type { Session } from "@/shared/relations.ts";
import { createSignedInUser, expectOk } from "@/tests/support/api.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { bumpContentVersion, createSeededTestRuleset, readView } from "@/tests/support/rulesets.ts";
import { RACE_BASE_SPEED, RACE_SIZE } from "@/vocabulary/dnd3.5/fields/index.ts";

/** The kinds these tests rename: a feat, a skill, a class, a race. */
type RenamedKind = "classes" | "feats" | "races" | "skills";

/** A modifier's stored bindings, as rows. */
async function bindingsOf(modifierId: string) {
  return await NameBindings.findMany(db, { modifierIds: [modifierId], requirementIds: [] });
}

/** A new feat of the fork's own, on its General list. */
async function createFeat(session: Session, rulesetId: string, name: string) {
  const general = Dnd35View.of(await readView(rulesetId)).aptitudes.find((aptitude) => aptitude.name === "General")!;
  return await EntitiesService.createEntity(session, rulesetId, "feats", {
    name,
    links: { listedIn: [{ toId: general.id }] },
  });
}

/** A new player race of the fork's own. */
async function createRace(session: Session, rulesetId: string, name: string) {
  const fields = { [RACE_SIZE]: "Medium", [RACE_BASE_SPEED]: 30 };
  return await EntitiesService.createEntity(session, rulesetId, "races", { name, fields });
}

/** A new skill of the fork's own, keyed on Strength. */
async function createSkill(session: Session, rulesetId: string, name: string) {
  const strength = Dnd35View.of(await readView(rulesetId)).abilities.find((ability) => ability.name === "Strength")!;
  return await EntitiesService.createEntity(session, rulesetId, "skills", { name, links: { keyAbility: strength.id } });
}

/**
 * Drops a row's bindings, as a row written past a save has none until a fill (SQL, a script), and tells the ruleset's
 * views (`rulesetId`).
 */
async function dropBindings(rulesetId: string, row: { modifierId: string } | { requirementId: string }) {
  if ("modifierId" in row)
    await db.execute(sql`delete from customization.name_bindings where modifier_id = ${row.modifierId}`);
  else await db.execute(sql`delete from customization.name_bindings where requirement_id = ${row.requirementId}`);
  await bumpContentVersion(rulesetId);
  RulesetViews.invalidate(rulesetId);
}

/** The entity of a kind and a name the fork's view shows (a player's race, not a familiar's). */
async function findNamed(rulesetId: string, kind: RenamedKind, name: string) {
  const rows: { id: string; name: string; partition?: string | null }[] = Dnd35View.of(await readView(rulesetId))[kind];
  const found = rows.find((row) => row.name === name && row.partition !== "familiar");
  if (!found) throw new Error(`No ${kind} named ${name} in ${rulesetId}`);
  return found;
}

/** Renames the entity of a kind and a name in the fork, as its page saves a new name. */
async function rename(session: Session, rulesetId: string, kind: RenamedKind, from: string, to: string) {
  const entity = await findNamed(rulesetId, kind, from);
  await EntitiesService.updateEntity(session, rulesetId, kind, entity.id, { name: to });
}

/** A signed-in user's fork of the seeded 3.5 core, their session and their client. */
async function setUp() {
  const { api, session, user } = await createSignedInUser();
  const fork = await createSeededTestRuleset(user.id);
  return { api, fork, session, user };
}

describe("a requirement's dialog opened before a rename", () => {
  test("saves its operator and keeps meaning the renamed feat, even once another feat takes the old name", async () => {
    const { api, fork, session } = await setUp();
    const requirements = api.api.rulesets[":id"].customization[":entityType"][":entityId"].requirements;
    await createFeat(session, fork.id, "Mighty Swing");
    const holder = await createFeat(session, fork.id, "Cleaving Swing");
    const param = { id: fork.id, entityType: "feats", entityId: holder.id };
    await expectOk(
      requirements.$post({
        param,
        json: { level: "1", operator: "equal", target: "feats.mightyswing.possessed", value: "true" },
      }),
    );
    // The dialog opens on the condition as its page lists it
    const [opened] = await expectOk(requirements.$get({ param }));
    expect(opened.target).toBe("feats.mightyswing.possessed");

    await rename(session, fork.id, "feats", "Mighty Swing", "Heavy Swing");
    const requirement = requirements[":requirementId"];
    const put = { ...param, requirementId: opened.id };
    // Its author changed the operator alone: the dialog sends no target
    await expectOk(
      requirement.$put({ param: put, json: { level: "1", operator: "not_equal", updatedAt: opened.updatedAt } }),
    );
    expect(await expectOk(requirements.$get({ param }))).toMatchObject([
      { operator: "not_equal", target: "feats.heavyswing.possessed", value: "true" },
    ]);

    await createFeat(session, fork.id, "Mighty Swing");
    const [reopened] = await expectOk(requirements.$get({ param }));
    await expectOk(
      requirement.$put({ param: put, json: { level: "1", operator: "equal", updatedAt: reopened.updatedAt } }),
    );
    await rename(session, fork.id, "feats", "Heavy Swing", "Huge Swing");
    expect(await expectOk(requirements.$get({ param }))).toMatchObject([
      { operator: "equal", target: "feats.hugeswing.possessed" },
    ]);
  });

  test("saves a new value on a skill's path and keeps meaning the renamed skill", async () => {
    const { api, fork, session } = await setUp();
    const requirements = api.api.rulesets[":id"].customization[":entityType"][":entityId"].requirements;
    const holder = await createFeat(session, fork.id, "Wall Runner");
    const param = { id: fork.id, entityType: "feats", entityId: holder.id };
    const created = await expectOk(
      requirements.$post({
        param,
        json: { level: "1", operator: "greater_than", target: "skills.climb.rank", value: "4" },
      }),
    );

    await rename(session, fork.id, "skills", "Climb", "Scaling");
    await createSkill(session, fork.id, "Climb");
    await expectOk(
      requirements[":requirementId"].$put({
        param: { ...param, requirementId: created.id },
        json: { level: "1", operator: "greater_than", value: "07", updatedAt: created.updatedAt },
      }),
    );

    expect(await expectOk(requirements.$get({ param }))).toMatchObject([
      { operator: "greater_than", target: "skills.scaling.rank", value: "7" },
    ]);
  });

  test("saves its operator on a race's name and keeps meaning the renamed race, not a new race of the old name", async () => {
    const { api, fork, session } = await setUp();
    const requirements = api.api.rulesets[":id"].customization[":entityType"][":entityId"].requirements;
    const holder = await createFeat(session, fork.id, "Stonecunning Lore");
    const param = { id: fork.id, entityType: "feats", entityId: holder.id };
    const created = await expectOk(
      requirements.$post({
        param,
        json: { level: "1", operator: "equal", target: "identity.physiology.race.name", value: "Dwarf" },
      }),
    );

    await rename(session, fork.id, "races", "Dwarf", "Mountain Dwarf");
    await createRace(session, fork.id, "Dwarf");
    await expectOk(
      requirements[":requirementId"].$put({
        param: { ...param, requirementId: created.id },
        json: { level: "1", operator: "not_equal", updatedAt: created.updatedAt },
      }),
    );
    expect(await expectOk(requirements.$get({ param }))).toMatchObject([
      { operator: "not_equal", value: "Mountain Dwarf" },
    ]);

    await rename(session, fork.id, "races", "Mountain Dwarf", "Hill Dwarf");
    expect(await expectOk(requirements.$get({ param }))).toMatchObject([{ value: "Hill Dwarf" }]);
  });

  test("on an inherited feat: the fork's copy of the requirement keeps meaning the renamed feat", async () => {
    const { api, fork, session } = await setUp();
    const requirements = api.api.rulesets[":id"].customization[":entityType"][":entityId"].requirements;
    const mobility = await findNamed(fork.id, "feats", "Mobility");
    const param = { id: fork.id, entityType: "feats", entityId: mobility.id };
    const opened = (await expectOk(requirements.$get({ param }))).find((r) => r.target === "feats.dodge.possessed")!;

    await rename(session, fork.id, "feats", "Dodge", "Sidestep");
    await createFeat(session, fork.id, "Dodge");
    await expectOk(
      requirements[":requirementId"].$put({
        param: { ...param, requirementId: opened.id },
        json: { level: opened.level, operator: "not_equal", updatedAt: opened.updatedAt },
      }),
    );

    const copy = await findNamed(fork.id, "feats", "Mobility");
    expect(copy.id).not.toBe(mobility.id);
    const listed = await expectOk(requirements.$get({ param: { ...param, entityId: copy.id } }));
    expect(listed.filter((r) => r.operator === "not_equal").map((r) => r.target)).toEqual(["feats.sidestep.possessed"]);
  });

  test("a new path is bound to what it names now: the feat that took the old name", async () => {
    const { api, fork, session } = await setUp();
    const requirements = api.api.rulesets[":id"].customization[":entityType"][":entityId"].requirements;
    await createFeat(session, fork.id, "Mighty Swing");
    const holder = await createFeat(session, fork.id, "Cleaving Swing");
    const param = { id: fork.id, entityType: "feats", entityId: holder.id };
    const created = await expectOk(
      requirements.$post({
        param,
        json: { level: "1", operator: "equal", target: "feats.mightyswing.possessed", value: "true" },
      }),
    );
    await rename(session, fork.id, "feats", "Mighty Swing", "Heavy Swing");
    await createFeat(session, fork.id, "Mighty Swing");

    // Its author picked the path again: the dialog sends it, and the new feat of that name is meant
    await expectOk(
      requirements[":requirementId"].$put({
        param: { ...param, requirementId: created.id },
        json: { level: "1", target: "feats.mightyswing.possessed", updatedAt: created.updatedAt },
      }),
    );
    await rename(session, fork.id, "feats", "Mighty Swing", "Brutal Swing");
    expect(await expectOk(requirements.$get({ param }))).toMatchObject([{ target: "feats.brutalswing.possessed" }]);
  });

  test("a group made a condition binds the target it's sent, and made a group again drops it", async () => {
    const { api, fork, session } = await setUp();
    const requirements = api.api.rulesets[":id"].customization[":entityType"][":entityId"].requirements;
    await createFeat(session, fork.id, "Mighty Swing");
    const holder = await createFeat(session, fork.id, "Cleaving Swing");
    const param = { id: fork.id, entityType: "feats", entityId: holder.id };
    const group = await expectOk(requirements.$post({ param, json: { level: "1", chainingOperator: "or" } }));
    const put = { ...param, requirementId: group.id };

    const condition = await expectOk(
      requirements[":requirementId"].$put({
        param: put,
        json: { level: "1", operator: "equal", target: "feats.mightyswing.possessed", value: "true" },
      }),
    );
    await rename(session, fork.id, "feats", "Mighty Swing", "Heavy Swing");
    expect(await expectOk(requirements.$get({ param }))).toMatchObject([
      { chainingOperator: null, target: "feats.heavyswing.possessed" },
    ]);

    await expectOk(
      requirements[":requirementId"].$put({
        param: put,
        json: { level: "1", chainingOperator: "and", updatedAt: condition.updatedAt },
      }),
    );
    expect(await expectOk(requirements.$get({ param }))).toMatchObject([{ chainingOperator: "and", target: null }]);
    expect(await NameBindings.findMany(db, { modifierIds: [], requirementIds: [group.id] })).toEqual([]);
  });
});

describe("a modifier's dialog opened before a rename", () => {
  test("saves a new value and keeps meaning the renamed skill, not a new skill of the old name", async () => {
    const { api, fork, session } = await setUp();
    const modifiers = api.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers;
    const holder = await createFeat(session, fork.id, "Sure Grip");
    const param = { id: fork.id, entityType: "feats", entityId: holder.id };
    const created = await expectOk(
      modifiers.$post({ param, json: { operator: "add", target: "skills.climb.misc", value: "2" } }),
    );

    await rename(session, fork.id, "skills", "Climb", "Scaling");
    await createSkill(session, fork.id, "Climb");
    // Its author changed the value alone: the dialog sends no target
    await expectOk(
      modifiers[":modifierId"].$put({
        param: { ...param, modifierId: created.id },
        json: { operator: "add", value: "3", updatedAt: created.updatedAt },
      }),
    );

    expect(await expectOk(modifiers.$get({ param }))).toMatchObject([{ target: "skills.scaling.misc", value: "3" }]);
    await rename(session, fork.id, "skills", "Scaling", "Ascent");
    expect(await expectOk(modifiers.$get({ param }))).toMatchObject([{ target: "skills.ascent.misc" }]);
  });

  test("saves its operator and keeps the class its formula names, and a new formula binds its own", async () => {
    const { api, fork, session } = await setUp();
    const modifiers = api.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers;
    const holder = await createFeat(session, fork.id, "Wild Growth");
    const param = { id: fork.id, entityType: "feats", entityId: holder.id };
    const created = await expectOk(
      modifiers.$post({
        param,
        json: { operator: "add", target: "skills.survival.misc", value: "{{ [classes.druid.level] }}" },
      }),
    );
    const modifier = modifiers[":modifierId"];
    const put = { ...param, modifierId: created.id };

    await rename(session, fork.id, "classes", "Druid", "Greenwarden");
    await rename(session, fork.id, "skills", "Survival", "Wayfinding");
    await expectOk(modifier.$put({ param: put, json: { operator: "subtract", updatedAt: created.updatedAt } }));
    const [kept] = await expectOk(modifiers.$get({ param }));
    expect(kept).toMatchObject({
      operator: "subtract",
      target: "skills.wayfinding.misc",
      value: "{{ [classes.greenwarden.level] }}",
    });

    // A new value names the class it names now, beside the target it keeps
    await expectOk(
      modifier.$put({
        param: put,
        json: { operator: "add", value: "{{ [classes.ranger.level] }}", updatedAt: kept.updatedAt },
      }),
    );
    await rename(session, fork.id, "classes", "Ranger", "Strider");
    await rename(session, fork.id, "skills", "Wayfinding", "Tracking");
    expect(await expectOk(modifiers.$get({ param }))).toMatchObject([
      { operator: "add", target: "skills.tracking.misc", value: "{{ [classes.strider.level] }}" },
    ]);
  });

  test("a new path is bound to what it names now: the skill that took the old name", async () => {
    const { api, fork, session } = await setUp();
    const modifiers = api.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers;
    const holder = await createFeat(session, fork.id, "Sure Grip");
    const param = { id: fork.id, entityType: "feats", entityId: holder.id };
    const created = await expectOk(
      modifiers.$post({ param, json: { operator: "add", target: "skills.climb.misc", value: "2" } }),
    );
    await rename(session, fork.id, "skills", "Climb", "Scaling");
    await createSkill(session, fork.id, "Climb");

    await expectOk(
      modifiers[":modifierId"].$put({
        param: { ...param, modifierId: created.id },
        json: { operator: "add", target: "skills.climb.misc", updatedAt: created.updatedAt },
      }),
    );
    await rename(session, fork.id, "skills", "Climb", "Bouldering");
    expect(await expectOk(modifiers.$get({ param }))).toMatchObject([{ target: "skills.bouldering.misc", value: "2" }]);
  });
});

describe("a character's own modifier's dialog opened before a rename", () => {
  test("saves a new value and keeps meaning the renamed skill; a new path binds the skill of its name", async () => {
    const { api, fork, session, user } = await setUp();
    const character = await createTestCharacter(user.id, { rulesetId: fork.id });
    const modifiers = api.api.characters.modifiers[":characterId"].modifiers;
    const param = { characterId: character.id };
    const created = await expectOk(
      modifiers.$post({ param, json: { operator: "add", target: "skills.climb.misc", value: "5" } }),
    );
    const put = { ...param, modifierId: created.id };

    await rename(session, fork.id, "skills", "Climb", "Scaling");
    await createSkill(session, fork.id, "Climb");
    await expectOk(
      modifiers[":modifierId"].$put({
        param: put,
        json: { operator: "add", value: "6", updatedAt: created.updatedAt },
      }),
    );
    const [kept] = await expectOk(modifiers.$get({ param }));
    expect(kept).toMatchObject({ target: "skills.scaling.misc", value: "6" });

    await expectOk(
      modifiers[":modifierId"].$put({
        param: put,
        json: { operator: "add", target: "skills.climb.misc", updatedAt: kept.updatedAt },
      }),
    );
    await rename(session, fork.id, "skills", "Climb", "Bouldering");
    expect(await expectOk(modifiers.$get({ param }))).toMatchObject([{ target: "skills.bouldering.misc", value: "6" }]);
  });
});

describe("a row written past a save, which holds no binding yet", () => {
  test("a modifier's new value binds its target too, which then follows its skill", async () => {
    const { api, fork, session } = await setUp();
    const modifiers = api.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers;
    const holder = await createFeat(session, fork.id, "Sure Grip");
    const param = { id: fork.id, entityType: "feats", entityId: holder.id };
    const created = await expectOk(
      modifiers.$post({ param, json: { operator: "add", target: "skills.climb.misc", value: "2" } }),
    );
    await dropBindings(fork.id, { modifierId: created.id });

    await expectOk(
      modifiers[":modifierId"].$put({
        param: { ...param, modifierId: created.id },
        json: { operator: "add", value: "{{ [skills.jump.rank] }}" },
      }),
    );
    await rename(session, fork.id, "skills", "Climb", "Scaling");
    await rename(session, fork.id, "skills", "Jump", "Leap");

    expect(await expectOk(modifiers.$get({ param }))).toMatchObject([
      { target: "skills.scaling.misc", value: "{{ [skills.leap.rank] }}" },
    ]);
  });

  test("a requirement's new value binds its target too, which then follows its skill", async () => {
    const { api, fork, session } = await setUp();
    const requirements = api.api.rulesets[":id"].customization[":entityType"][":entityId"].requirements;
    const holder = await createFeat(session, fork.id, "Wall Runner");
    const param = { id: fork.id, entityType: "feats", entityId: holder.id };
    const created = await expectOk(
      requirements.$post({
        param,
        json: { level: "1", operator: "greater_than", target: "skills.climb.rank", value: "4" },
      }),
    );
    await dropBindings(fork.id, { requirementId: created.id });

    await expectOk(
      requirements[":requirementId"].$put({
        param: { ...param, requirementId: created.id },
        json: { level: "1", value: "{{ [skills.jump.rank] }}" },
      }),
    );
    await rename(session, fork.id, "skills", "Climb", "Scaling");

    expect(await expectOk(requirements.$get({ param }))).toMatchObject([
      { target: "skills.scaling.rank", value: "{{ [skills.jump.rank] }}" },
    ]);
  });

  test("a character's own modifier's new value binds its target too", async () => {
    const { api, fork, session, user } = await setUp();
    const character = await createTestCharacter(user.id, { rulesetId: fork.id });
    const modifiers = api.api.characters.modifiers[":characterId"].modifiers;
    const param = { characterId: character.id };
    const created = await expectOk(
      modifiers.$post({ param, json: { operator: "add", target: "skills.climb.misc", value: "5" } }),
    );
    await dropBindings(fork.id, { modifierId: created.id });

    await expectOk(
      modifiers[":modifierId"].$put({
        param: { ...param, modifierId: created.id },
        json: { operator: "add", value: "6" },
      }),
    );
    await rename(session, fork.id, "skills", "Climb", "Scaling");

    expect(await expectOk(modifiers.$get({ param }))).toMatchObject([{ target: "skills.scaling.misc", value: "6" }]);
  });
});

describe("a new target, its formula value left as it was", () => {
  test("keeps the formula's stored bindings, and binds the new target", async () => {
    const { api, fork, session } = await setUp();
    const modifiers = api.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers;
    const holder = await createFeat(session, fork.id, "Wild Growth");
    const param = { id: fork.id, entityType: "feats", entityId: holder.id };
    const created = await expectOk(
      modifiers.$post({
        param,
        json: { operator: "add", target: "skills.climb.misc", value: "{{ [classes.druid.level] }}" },
      }),
    );
    const before = await bindingsOf(created.id);
    await rename(session, fork.id, "classes", "Druid", "Greenwarden");

    await expectOk(
      modifiers[":modifierId"].$put({
        param: { ...param, modifierId: created.id },
        json: { operator: "add", target: "skills.jump.misc", updatedAt: created.updatedAt },
      }),
    );

    // The formula's binding is the one it was saved with; the target's is the new path's
    const after = await bindingsOf(created.id);
    expect(after.filter((binding) => binding.field === "value")).toEqual(
      before.filter((binding) => binding.field === "value"),
    );
    expect(after.filter((binding) => binding.field === "target").map((binding) => binding.name)).toEqual(["Jump"]);
    expect(await expectOk(modifiers.$get({ param }))).toMatchObject([
      { target: "skills.jump.misc", value: "{{ [classes.greenwarden.level] }}" },
    ]);
  });

  test("on a character's own modifier, keeps the deleted skill the formula names, not a new skill of its name", async () => {
    const { api, fork, session, user } = await setUp();
    const ropeWork = await createSkill(session, fork.id, "Rope Work");
    const character = await createTestCharacter(user.id, { rulesetId: fork.id });
    const modifiers = api.api.characters.modifiers[":characterId"].modifiers;
    const param = { characterId: character.id };
    const created = await expectOk(
      modifiers.$post({
        param,
        json: { operator: "add", target: "abilities.strength.misc", value: "{{ [skills.ropework.rank] }}" },
      }),
    );
    await EntitiesService.deleteEntity(session, fork.id, "skills", ropeWork.id);
    await createSkill(session, fork.id, "Rope Work");

    await expectOk(
      modifiers[":modifierId"].$put({
        param: { ...param, modifierId: created.id },
        json: { operator: "add", target: "abilities.dexterity.misc", updatedAt: created.updatedAt },
      }),
    );
    await rename(session, fork.id, "skills", "Rope Work", "Knots");

    // Still the deleted skill's: listed as it's stored, never the new skill's name
    expect(await expectOk(modifiers.$get({ param }))).toMatchObject([
      { target: "abilities.dexterity.misc", value: "{{ [skills.ropework.rank] }}" },
    ]);
  });
});
