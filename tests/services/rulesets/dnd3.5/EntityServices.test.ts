/**
 * The contract every ruleset entity service keeps: CRUD, ownership, lineage, copy-on-write and customization cleanup.
 * Each entity's own test file only covers what is specific to it.
 */

import { describe, expect, test } from "bun:test";

import type { RulesetAbility, RulesetSave, Skill } from "@/engine/rulesets/dnd3.5/index.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { ForbiddenError } from "@/server/errors/index.ts";
import { CUSTOMIZABLE_TYPES, Entities, Requirements, type RulesetEntityType } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import type { Session } from "@/shared/relations.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { findCustomizations } from "@/tests/support/customizations.ts";
import { customize } from "@/tests/support/dnd3.5/customizations.ts";
import { findLists } from "@/tests/support/dnd3.5/links.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import { copyEntity, createTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import {
  LANGUAGE_TYPE,
  RACE_BASE_SPEED,
  RACE_SIZE,
  SKILL_CHECK_PENALTY_MULTIPLIER,
  SKILL_IMPACTED_BY_WEIGHT,
  SKILL_USABLE_WITHOUT_TRAINING,
} from "@/vocabulary/dnd3.5/fields/index.ts";

interface Page {
  items: { id: string; name: string }[];
}
/** Rows an entity's body refers to, created in the ruleset under test. */
interface Refs {
  abilityId: string;
  featAptitudeId: string;
  spellAptitudeId: string;
}

interface Row {
  id: string;
  name: string;
  rulesetId: string;
  updatedAt: string;
}

interface Service {
  create: (session: Session, rulesetId: string, name: string, refs: Refs) => Promise<Row>;
  get: (rulesetId: string, id: string) => Promise<{ id: string; name: string }>;
  list: (rulesetId: string, search?: string) => Promise<Page>;
  remove: (session: Session, rulesetId: string, id: string) => Promise<unknown>;
  /** `updatedAt` is the stale-edit token: the version of the entity the edit started from. */
  update: (
    session: Session,
    rulesetId: string,
    id: string,
    name: string,
    refs: Refs,
    updatedAt?: string,
  ) => Promise<Row>;
}

/** What each kind's form gives past its name, of the entities it names by id (`Refs`). */
const BODIES: Partial<Record<RulesetEntityType, (refs: Refs) => Record<string, unknown>>> = {
  aptitudes: () => ({}),
  feats: (refs) => ({ links: { listedIn: [{ toId: refs.featAptitudeId }] } }),
  items: () => ({}),
  classes: () => ({}),
  languages: () => ({ fields: { [LANGUAGE_TYPE]: "Standard" } }),
  mechanics: () => ({}),
  spells: (refs) => ({ links: { listedIn: [{ toId: refs.spellAptitudeId }] } }),
  races: () => ({ fields: { [RACE_SIZE]: "Medium", [RACE_BASE_SPEED]: 30 } }),
  saves: (refs) => ({ links: { keyAbility: refs.abilityId } }),
  skills: (refs) => ({
    links: { keyAbility: refs.abilityId },
    fields: {
      [SKILL_IMPACTED_BY_WEIGHT]: false,
      [SKILL_CHECK_PENALTY_MULTIPLIER]: 1,
      [SKILL_USABLE_WITHOUT_TRAINING]: true,
    },
  }),
};

const firstPage = { limit: 100, page: 1 };

/** Each kind's service, as the generic one answers it: its form, its name and what it names past it. */
const SERVICES: Record<string, Service> = Object.fromEntries(
  Object.entries(BODIES).map(([kind, body]) => {
    const type = kind as RulesetEntityType;
    const service: Service = {
      list: (rulesetId, search) => EntitiesService.getEntities(rulesetId, type, { search }, firstPage),
      get: (rulesetId, id) => EntitiesService.getEntity(rulesetId, type, id),
      create: (session, rulesetId, name, refs) =>
        EntitiesService.createEntity(session, rulesetId, type, { name, ...body(refs) }),
      update: (session, rulesetId, id, name, refs, updatedAt) =>
        EntitiesService.updateEntity(session, rulesetId, type, id, { name, ...body(refs), updatedAt }),
      remove: (session, rulesetId, id) => EntitiesService.deleteEntity(session, rulesetId, type, id),
    };
    return [type, service];
  }),
);

const ENTITY_TYPES = Object.keys(SERVICES);

/**
 * What a kind's form names by id (one of its `Refs`: an ability, or a pool it's listed in), the kind of entity that is
 * and what a refusal calls it, and the id its row stores for it.
 */
const FORM_REFS: Record<
  string,
  { kind: "abilities" | "aptitudes"; label: string; ref: keyof Refs; stored: (id: string) => Promise<unknown> }
> = {
  feats: {
    kind: "aptitudes",
    label: "Aptitude",
    ref: "featAptitudeId",
    stored: async (id) => (await findLists(db, [id])).map(({ toId }) => toId),
  },
  spells: {
    kind: "aptitudes",
    label: "Aptitude",
    ref: "spellAptitudeId",
    stored: async (id) => (await findLists(db, [id])).map(({ toId }) => toId),
  },
  saves: {
    kind: "abilities",
    label: "Ability",
    ref: "abilityId",
    stored: async (id) => [(await Entities.findOne<RulesetSave>(db, { entityType: "saves", id }))?.links.keyAbility],
  },
  skills: {
    kind: "abilities",
    label: "Ability",
    ref: "abilityId",
    stored: async (id) => [(await Entities.findOne<Skill>(db, { entityType: "skills", id }))?.links.keyAbility],
  },
};

/** How many of each an entity has: the one `customize` gives it, of its fields' values. */
async function counts(entityType: (typeof ENTITY_TYPES)[number], id: string) {
  const { modifiers, modifierRequirements, requirements, values } = await findCustomizations(entityType, id);
  return {
    modifiers: modifiers.length,
    modifierRequirements: modifierRequirements.length,
    requirements: requirements.length,
    values: Object.values(values.fields)
      .flat()
      .filter((value) => value === "doomed").length,
  };
}

/** Whether any of these requirements is left. */
async function remaining(ids: string[]) {
  const left = [];
  for (const id of ids) {
    const requirement = await Requirements.findOne(db, { id });
    if (requirement) left.push(requirement);
  }
  return left;
}

/** A new user's empty ruleset, holding the rows entity bodies refer to. */
async function setup() {
  const { user, session, ruleset } = await createTestUserAndRuleset();
  const [ability] = await Entities.create<RulesetAbility>(db, "abilities", {
    rulesetId: ruleset.id,
    name: "Strength",
    description: "Strength",
  });
  const featAptitude = await EntitiesService.createEntity(session, ruleset.id, "aptitudes", { name: "Feat Aptitude" });
  const spellAptitude = await EntitiesService.createEntity(session, ruleset.id, "aptitudes", {
    name: "Spell Aptitude",
  });
  const refs: Refs = { abilityId: ability.id, featAptitudeId: featAptitude.id, spellAptitudeId: spellAptitude.id };
  return { user, session, ruleset, refs };
}

describe.each(ENTITY_TYPES)("%s service", (entityType) => {
  const service = SERVICES[entityType];

  test("creates, reads, lists, searches, renames and deletes an entity", async () => {
    const { session, ruleset, refs } = await setup();
    const created = await service.create(session, ruleset.id, "Zephyr Entity", refs);
    expect(created).toMatchObject({ name: "Zephyr Entity", rulesetId: ruleset.id });

    expect(await service.get(ruleset.id, created.id)).toMatchObject({ id: created.id, name: "Zephyr Entity" });
    expect((await service.list(ruleset.id)).items.map((e) => e.id)).toContain(created.id);
    expect((await service.list(ruleset.id, "Zephyr")).items.map((e) => e.id)).toEqual([created.id]);

    expect(await service.update(session, ruleset.id, created.id, "Renamed Entity", refs)).toMatchObject({
      id: created.id,
      name: "Renamed Entity",
    });
    await service.remove(session, ruleset.id, created.id);
    await expectRefusedWith(service.get(ruleset.id, created.id), 404);
  });

  test("finds a name by a typo of it, and none by letters across its words", async () => {
    const { session, ruleset, refs } = await setup();
    const missile = await service.create(session, ruleset.id, "Magic Missile", refs);
    await service.create(session, ruleset.id, "Guards and Wards", refs);

    expect((await service.list(ruleset.id, "Magic Missle")).items.map((e) => e.id)).toEqual([missile.id]);
    // "Wand" is in none of them, though "...ds and Wa..." holds its letters
    expect((await service.list(ruleset.id, "Wand")).items).toEqual([]);
  });

  test("doesn't find a missing ruleset or entity", async () => {
    const { session, ruleset, refs } = await setup();
    await expectRefusedWith(service.list(NIL_UUID), 404);
    await expectRefusedWith(service.get(ruleset.id, NIL_UUID), 404);
    await expectRefusedWith(service.create(session, NIL_UUID, "Missing", refs), 404);
    await expectRefusedWith(service.update(session, ruleset.id, NIL_UUID, "Missing", refs), 404);
    await expectRefusedWith(service.remove(session, ruleset.id, NIL_UUID), 404);
  });

  test("refuses writes from anyone but the owner, and through another ruleset", async () => {
    const { session, ruleset, refs } = await setup();
    const entity = await service.create(session, ruleset.id, "Guarded Entity", refs);
    const { session: other, ruleset: otherRuleset } = await createTestUserAndRuleset();

    expect(service.create(other, ruleset.id, "Intruder", refs)).rejects.toThrow(ForbiddenError);
    expect(service.update(other, ruleset.id, entity.id, "Hijacked", refs)).rejects.toThrow(ForbiddenError);
    expect(service.remove(other, ruleset.id, entity.id)).rejects.toThrow(ForbiddenError);
    // Reading it through a ruleset it isn't part of doesn't find it either.
    await expectRefusedWith(service.get(otherRuleset.id, entity.id), 404);
  });

  test("refuses an edit started from a stale copy, unless it sends no token", async () => {
    const { session, ruleset, refs } = await setup();
    const created = await service.create(session, ruleset.id, "Contested Entity", refs);
    await service.update(session, ruleset.id, created.id, "First Edit", refs, created.updatedAt);
    await expectRefusedWith(
      service.update(session, ruleset.id, created.id, "Second Edit", refs, created.updatedAt),
      409,
    );
    expect(await service.update(session, ruleset.id, created.id, "Tokenless Edit", refs)).toMatchObject({
      name: "Tokenless Edit",
    });
  });

  test("refuses a name the ruleset already uses, to a create and a rename, and keeps an entity's own", async () => {
    const { session, ruleset, refs } = await setup();
    await service.create(session, ruleset.id, "Taken Name", refs);
    await expectRefusedWith(service.create(session, ruleset.id, "Taken Name", refs), 409);

    const other = await service.create(session, ruleset.id, "Other Name", refs);
    await expectRefusedWith(service.update(session, ruleset.id, other.id, "Taken Name", refs), 409);
    expect(await service.update(session, ruleset.id, other.id, "Other Name", refs)).toMatchObject({
      id: other.id,
      name: "Other Name",
    });
  });

  test("copies an inherited entity into the fork on edit, under its name, and refuses the parent's names", async () => {
    const { session: parentSession, ruleset: parent, refs } = await setup();
    const inherited = await service.create(parentSession, parent.id, "Inherited Entity", refs);
    const { user, session } = await createTestUserAndRuleset();
    const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });

    await expectRefusedWith(service.create(session, fork.id, "Inherited Entity", refs), 409);
    const own = await service.create(session, fork.id, "Own Entity", refs);
    await expectRefusedWith(service.update(session, fork.id, own.id, "Inherited Entity", refs), 409);

    // Its first edit copies it under its name, which its source, hidden behind the copy, no longer shows
    const copy = await service.update(session, fork.id, inherited.id, "Inherited Entity", refs);
    expect(copy).toMatchObject({ name: "Inherited Entity", rulesetId: fork.id });
    expect(copy.id).not.toBe(inherited.id);
    // Later edits through the source's id go to the same copy.
    expect(await service.update(session, fork.id, inherited.id, "Forked Entity", refs)).toMatchObject({
      id: copy.id,
      name: "Forked Entity",
    });
    expect(await service.get(fork.id, inherited.id)).toMatchObject({ id: copy.id, name: "Forked Entity" });
    expect(await service.get(parent.id, inherited.id)).toMatchObject({ name: "Inherited Entity" });
  });

  test("deletes an inherited entity from the fork only", async () => {
    const { session: parentSession, ruleset: parent, refs } = await setup();
    const inherited = await service.create(parentSession, parent.id, "Inherited Entity", refs);
    const { user, session } = await createTestUserAndRuleset();
    const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });

    await service.remove(session, fork.id, inherited.id);
    expect((await service.list(fork.id)).items.map((e) => e.name)).not.toContain("Inherited Entity");
    expect(await service.get(parent.id, inherited.id)).toMatchObject({ name: "Inherited Entity" });
  });
});

describe.each(Object.keys(FORM_REFS))("%s form naming another entity", (entityType) => {
  const service = SERVICES[entityType];
  const { kind, label, ref, stored } = FORM_REFS[entityType];

  test("stores what its fork copied as the copy, sent by its source's id, and refuses an id the fork lacks by name", async () => {
    const { ruleset: parent, refs } = await setup();
    const { user, session } = await createTestUserAndRuleset();
    const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });
    const copy = await copyEntity(db, kind, refs[ref], fork);
    RulesetViews.invalidate(fork.id);

    // The parent's ids are the sources': the API takes them, as it takes the copies' the client sends
    const created = await service.create(session, fork.id, "Referring Entity", refs);
    expect(await stored(created.id)).toEqual([copy.id]);
    await service.update(session, fork.id, created.id, "Edited Entity", { ...refs, [ref]: copy.id });
    await service.update(session, fork.id, created.id, "Edited Again", refs);
    expect(await stored(created.id)).toEqual([copy.id]);

    // An id no ruleset has, and one of an unrelated ruleset: a 500 and another ruleset's entity, once
    const { refs: unrelated } = await setup();
    for (const id of [NIL_UUID, unrelated[ref]]) {
      expect(service.create(session, fork.id, "Lacking Entity", { ...refs, [ref]: id })).rejects.toMatchObject({
        message: `${label} ${id} does not belong to this ruleset`,
        refusal: "invalid",
      });
    }
  });
});

test("refuses a form naming one list twice: by its source's id and its copy's", async () => {
  const { ruleset: parent, refs } = await setup();
  const { user, session } = await createTestUserAndRuleset();
  const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });
  const copy = await copyEntity(db, "aptitudes", refs.featAptitudeId, fork);
  RulesetViews.invalidate(fork.id);

  const aptitudeIds = [refs.featAptitudeId, copy.id];
  expect(
    EntitiesService.createEntity(session, fork.id, "feats", {
      name: "Listed Twice",
      links: { listedIn: aptitudeIds.map((toId) => ({ toId })) },
    }),
  ).rejects.toMatchObject({
    message: `Aptitude ${copy.id} is given more than once`,
    refusal: "invalid",
  });
});

// Mechanics can't be customized, so nothing can point at them.
describe.each(ENTITY_TYPES.filter((type) => type !== "mechanics"))("customized %s", (entityType) => {
  const service = SERVICES[entityType];
  const ownsModifiers = CUSTOMIZABLE_TYPES.includes(entityType);

  const none = { modifiers: 0, modifierRequirements: 0, requirements: 0, values: 0 };
  const one = { modifiers: Number(ownsModifiers), modifierRequirements: Number(ownsModifiers), requirements: 1 };

  test("deletes the entity's modifiers, requirements and fields with it", async () => {
    const { session, ruleset, refs } = await setup();
    const { id } = await service.create(session, ruleset.id, "Doomed Entity", refs);
    // Customizations point at their entity polymorphically: no foreign key removes them.
    await customize(entityType, id, { modifier: ownsModifiers });
    const modifierRequirementIds = (await findCustomizations(entityType, id)).modifierRequirements.map((r) => r.id);

    await service.remove(session, ruleset.id, id);
    expect(await counts(entityType, id)).toEqual(none);
    expect(await remaining(modifierRequirementIds)).toEqual([]);
  });

  test("copies an inherited entity's customizations into the fork, and deletes them with the copy", async () => {
    const { session: parentSession, ruleset: parent, refs } = await setup();
    const inherited = await service.create(parentSession, parent.id, "Inherited Entity", refs);
    await customize(entityType, inherited.id, { modifier: ownsModifiers });
    const { user, session } = await createTestUserAndRuleset();
    const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });

    const source = await findCustomizations(entityType, inherited.id);
    const sourceCounts = await counts(entityType, inherited.id);
    expect(sourceCounts).toMatchObject(one);

    const copy = await service.update(session, fork.id, inherited.id, "Forked Entity", refs);
    expect(await counts(entityType, copy.id)).toEqual(sourceCounts);
    const sourceIds = source.modifierRequirements.map((r) => r.id);
    const copiedIds = (await findCustomizations(entityType, copy.id)).modifierRequirements.map((r) => r.id);
    // The copy's modifier has its own copy of the modifier's requirements.
    expect(copiedIds.filter((id) => sourceIds.includes(id))).toEqual([]);

    await service.remove(session, fork.id, inherited.id);
    expect(await counts(entityType, copy.id)).toEqual(none);
    expect(await remaining(copiedIds)).toEqual([]);
    expect(await findCustomizations(entityType, inherited.id)).toEqual(source);
  });
});
