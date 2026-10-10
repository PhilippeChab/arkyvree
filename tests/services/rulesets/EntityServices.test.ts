/**
 * The contract every ruleset entity service keeps: CRUD, ownership, lineage, copy-on-write and customization cleanup.
 * Each entity's own test file only covers what is specific to it.
 */

import { describe, expect, test } from "bun:test";

import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { ForbiddenError } from "@/server/errors/index.ts";
import {
  Abilities,
  FeatsAptitudes,
  PowersAptitudes,
  Requirements,
  Saves,
  Skills,
} from "@/server/repositories/index.ts";
import { AptitudesService } from "@/server/services/rulesets/aptitudes/index.ts";
import { ClassesService } from "@/server/services/rulesets/classes/index.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import { ItemsService } from "@/server/services/rulesets/items/index.ts";
import { LanguagesService } from "@/server/services/rulesets/languages/index.ts";
import { MechanicsService } from "@/server/services/rulesets/mechanics/index.ts";
import { PowersService } from "@/server/services/rulesets/powers/index.ts";
import { RacesService } from "@/server/services/rulesets/races/index.ts";
import { SavesService } from "@/server/services/rulesets/saves/index.ts";
import { SkillsService } from "@/server/services/rulesets/skills/index.ts";
import { isCustomizableEntityType } from "@/shared/customization/entities.ts";
import type { Session } from "@/shared/relations.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { customize, findCustomizations } from "@/tests/support/customizations.ts";
import { copyEntity, createTestRuleset, createTestUserAndRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

interface Page {
  items: { id: string; name: string }[];
}
/** Rows an entity's body refers to, created in the ruleset under test. */
interface Refs {
  abilityId: string;
  featAptitudeId: string;
  powerAptitudeId: string;
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

const firstPage = { limit: 100, page: 1 };

const SERVICES: Record<string, Service> = {
  aptitudes: {
    list: (rulesetId, search) => AptitudesService.getAptitudes(rulesetId, { search }, firstPage),
    get: AptitudesService.getAptitude.bind(AptitudesService),
    create: (session, rulesetId, name) => AptitudesService.createAptitude(session, rulesetId, { name }),
    update: (session, rulesetId, id, name, _refs, updatedAt) =>
      AptitudesService.updateAptitude(session, rulesetId, id, { name, updatedAt }),
    remove: AptitudesService.deleteAptitude.bind(AptitudesService),
  },
  feats: {
    list: (rulesetId, search) => FeatsService.getFeats(rulesetId, { search }, firstPage),
    get: FeatsService.getFeat.bind(FeatsService),
    create: (session, rulesetId, name, refs) =>
      FeatsService.createFeat(session, rulesetId, { name, aptitudeIds: [refs.featAptitudeId] }),
    update: (session, rulesetId, id, name, refs, updatedAt) =>
      FeatsService.updateFeat(session, rulesetId, id, { name, aptitudeIds: [refs.featAptitudeId], updatedAt }),
    remove: FeatsService.deleteFeat.bind(FeatsService),
  },
  items: {
    list: (rulesetId, search) => ItemsService.getItems(rulesetId, { search }, firstPage),
    get: ItemsService.getItem.bind(ItemsService),
    create: (session, rulesetId, name) => ItemsService.createItem(session, rulesetId, { name }),
    update: (session, rulesetId, id, name, _refs, updatedAt) =>
      ItemsService.updateItem(session, rulesetId, id, { name, updatedAt }),
    remove: ItemsService.deleteItem.bind(ItemsService),
  },
  klasses: {
    list: (rulesetId, search) => ClassesService.getClasses(rulesetId, { search }, firstPage),
    get: ClassesService.getClass.bind(ClassesService),
    create: (session, rulesetId, name) => ClassesService.createClass(session, rulesetId, { name }),
    update: (session, rulesetId, id, name, _refs, updatedAt) =>
      ClassesService.updateClass(session, rulesetId, id, { name, updatedAt }),
    remove: ClassesService.deleteClass.bind(ClassesService),
  },
  languages: {
    list: (rulesetId, search) => LanguagesService.getLanguages(rulesetId, { search }, firstPage),
    get: LanguagesService.getLanguage.bind(LanguagesService),
    create: (session, rulesetId, name) =>
      LanguagesService.createLanguage(session, rulesetId, { name, type: "Standard" }),
    update: (session, rulesetId, id, name, _refs, updatedAt) =>
      LanguagesService.updateLanguage(session, rulesetId, id, { name, type: "Standard", updatedAt }),
    remove: LanguagesService.deleteLanguage.bind(LanguagesService),
  },
  mechanics: {
    list: (rulesetId, search) => MechanicsService.getMechanics(rulesetId, { search }, firstPage),
    get: MechanicsService.getMechanic.bind(MechanicsService),
    create: (session, rulesetId, name) => MechanicsService.createMechanic(session, rulesetId, { name }),
    update: (session, rulesetId, id, name, _refs, updatedAt) =>
      MechanicsService.updateMechanic(session, rulesetId, id, { name, updatedAt }),
    remove: MechanicsService.deleteMechanic.bind(MechanicsService),
  },
  powers: {
    list: (rulesetId, search) => PowersService.getPowers(rulesetId, { search }, firstPage),
    get: PowersService.getPower.bind(PowersService),
    create: (session, rulesetId, name, refs) =>
      PowersService.createPower(session, rulesetId, { name, aptitudes: [{ id: refs.powerAptitudeId }] }),
    update: (session, rulesetId, id, name, refs, updatedAt) =>
      PowersService.updatePower(session, rulesetId, id, {
        name,
        aptitudes: [{ id: refs.powerAptitudeId }],
        updatedAt,
      }),
    remove: PowersService.deletePower.bind(PowersService),
  },
  races: {
    list: (rulesetId, search) => RacesService.getRaces(rulesetId, { search }, firstPage),
    get: RacesService.getRace.bind(RacesService),
    create: (session, rulesetId, name) =>
      RacesService.createRace(session, rulesetId, { name, size: "Medium", baseSpeed: 30 }),
    update: (session, rulesetId, id, name, _refs, updatedAt) =>
      RacesService.updateRace(session, rulesetId, id, { name, size: "Medium", baseSpeed: 30, updatedAt }),
    remove: RacesService.deleteRace.bind(RacesService),
  },
  saves: {
    list: (rulesetId, search) => SavesService.getSaves(rulesetId, { search }, firstPage),
    get: SavesService.getSave.bind(SavesService),
    create: (session, rulesetId, name, refs) =>
      SavesService.createSave(session, rulesetId, { name, abilityId: refs.abilityId }),
    update: (session, rulesetId, id, name, refs, updatedAt) =>
      SavesService.updateSave(session, rulesetId, id, { name, abilityId: refs.abilityId, updatedAt }),
    remove: SavesService.deleteSave.bind(SavesService),
  },
  skills: {
    list: (rulesetId, search) => SkillsService.getSkills(rulesetId, { search }, firstPage),
    get: SkillsService.getSkill.bind(SkillsService),
    create: (session, rulesetId, name, refs) =>
      SkillsService.createSkill(session, rulesetId, {
        name,
        primaryAbilityId: refs.abilityId,
        fields: { impactedByWeight: false, checkPenaltyMultiplier: 1, usableWithoutTraining: true },
      }),
    update: (session, rulesetId, id, name, refs, updatedAt) =>
      SkillsService.updateSkill(session, rulesetId, id, {
        name,
        primaryAbilityId: refs.abilityId,
        fields: { impactedByWeight: false, checkPenaltyMultiplier: 1, usableWithoutTraining: true },
        updatedAt,
      }),
    remove: SkillsService.deleteSkill.bind(SkillsService),
  },
};

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
    stored: async (id) => (await FeatsAptitudes.findMany(db, { featIds: [id] })).map(({ aptitudeId }) => aptitudeId),
  },
  powers: {
    kind: "aptitudes",
    label: "Aptitude",
    ref: "powerAptitudeId",
    stored: async (id) => (await PowersAptitudes.findMany(db, { powerIds: [id] })).map(({ aptitudeId }) => aptitudeId),
  },
  saves: {
    kind: "abilities",
    label: "Ability",
    ref: "abilityId",
    stored: async (id) => [(await Saves.findOne(db, { id }))?.abilityId],
  },
  skills: {
    kind: "abilities",
    label: "Ability",
    ref: "abilityId",
    stored: async (id) => [(await Skills.findOne(db, { id }))?.primaryAbilityId],
  },
};

/** How many of each an entity has: its notes, of its properties. */
async function counts(entityType: (typeof ENTITY_TYPES)[number], id: string) {
  const { modifiers, modifierRequirements, requirements, properties } = await findCustomizations(entityType, id);
  return {
    modifiers: modifiers.length,
    modifierRequirements: modifierRequirements.length,
    requirements: requirements.length,
    properties: properties.filter((p) => p.type === "NOTE").length,
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
  const [ability] = await Abilities.create(db, { rulesetId: ruleset.id, name: "Strength", description: "Strength" });
  const featAptitude = await AptitudesService.createAptitude(session, ruleset.id, { name: "Feat Aptitude" });
  const powerAptitude = await AptitudesService.createAptitude(session, ruleset.id, { name: "Power Aptitude" });
  const refs: Refs = { abilityId: ability.id, featAptitudeId: featAptitude.id, powerAptitudeId: powerAptitude.id };
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

  test("refuses a name the ruleset already uses", async () => {
    const { session, ruleset, refs } = await setup();
    await service.create(session, ruleset.id, "Taken Name", refs);
    await expectRefusedWith(service.create(session, ruleset.id, "Taken Name", refs), 409);
  });

  test("copies an inherited entity into the fork on edit, and refuses a name the parent uses", async () => {
    const { session: parentSession, ruleset: parent, refs } = await setup();
    const inherited = await service.create(parentSession, parent.id, "Inherited Entity", refs);
    const { user, session } = await createTestUserAndRuleset();
    const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });

    await expectRefusedWith(service.create(session, fork.id, "Inherited Entity", refs), 409);

    const copy = await service.update(session, fork.id, inherited.id, "Forked Entity", refs);
    expect(copy).toMatchObject({ name: "Forked Entity", rulesetId: fork.id });
    expect(copy.id).not.toBe(inherited.id);
    expect(await service.get(fork.id, inherited.id)).toMatchObject({ id: copy.id, name: "Forked Entity" });
    // Later edits through the source's id go to the same copy.
    expect(await service.update(session, fork.id, inherited.id, "Edited Again", refs)).toMatchObject({
      id: copy.id,
      name: "Edited Again",
    });
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
  expect(FeatsService.createFeat(session, fork.id, { name: "Listed Twice", aptitudeIds })).rejects.toMatchObject({
    message: `Aptitude ${copy.id} is given more than once`,
    refusal: "invalid",
  });
});

// Mechanics can't be customized, so nothing can point at them.
describe.each(ENTITY_TYPES.filter((type) => type !== "mechanics"))("customized %s", (entityType) => {
  const service = SERVICES[entityType];
  const ownsModifiers = isCustomizableEntityType(entityType);

  const none = { modifiers: 0, modifierRequirements: 0, requirements: 0, properties: 0 };
  const one = {
    modifiers: Number(ownsModifiers),
    modifierRequirements: Number(ownsModifiers),
    requirements: 1,
    properties: 1,
  };

  test("deletes the entity's modifiers, requirements and properties with it", async () => {
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

    const copy = await service.update(session, fork.id, inherited.id, "Forked Entity", refs);
    expect(await counts(entityType, copy.id)).toEqual(one);
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
