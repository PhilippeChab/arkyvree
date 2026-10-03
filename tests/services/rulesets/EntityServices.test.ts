/**
 * The contract every ruleset entity service keeps: CRUD, ownership, lineage,
 * copy-on-write and customization cleanup. Each entity's own test file only
 * covers what is specific to it.
 */
import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Abilities, Modifiers, Properties, Requirements } from "@/server/repositories/index.ts";
import AptitudesService from "@/server/services/rulesets/AptitudesService.ts";
import ClassesService from "@/server/services/rulesets/ClassesService.ts";
import FeatsService from "@/server/services/rulesets/FeatsService.ts";
import ItemsService from "@/server/services/rulesets/ItemsService.ts";
import LanguagesService from "@/server/services/rulesets/LanguagesService.ts";
import MechanicsService from "@/server/services/rulesets/MechanicsService.ts";
import PowersService from "@/server/services/rulesets/PowersService.ts";
import RacesService from "@/server/services/rulesets/RacesService.ts";
import SavesService from "@/server/services/rulesets/SavesService.ts";
import SkillsService from "@/server/services/rulesets/SkillsService.ts";
import { isCustomizableEntityType } from "@/shared/customization/entities.ts";
import type { Session } from "@/shared/relations.ts";
import { createTestRuleset, createTestUserAndRuleset, methodsOf, NIL_UUID } from "@/tests/helpers.ts";

const AptitudesMethods = methodsOf(AptitudesService);
const ClassesMethods = methodsOf(ClassesService);
const FeatsMethods = methodsOf(FeatsService);
const ItemsMethods = methodsOf(ItemsService);
const LanguagesMethods = methodsOf(LanguagesService);
const MechanicsMethods = methodsOf(MechanicsService);
const PowersMethods = methodsOf(PowersService);
const RacesMethods = methodsOf(RacesService);
const SavesMethods = methodsOf(SavesService);
const SkillsMethods = methodsOf(SkillsService);

type Row = { id: string; name: string; rulesetId: string; updatedAt: string };
type Page = { items: { id: string; name: string }[] };

/** Rows an entity's body refers to, created in the ruleset under test. */
type Refs = { abilityId: string; featAptitudeId: string; powerAptitudeId: string };

type Service = {
  list: (rulesetId: string, search?: string) => Promise<Page>;
  get: (rulesetId: string, id: string) => Promise<{ id: string; name: string }>;
  create: (session: Session, rulesetId: string, name: string, refs: Refs) => Promise<Row>;
  /** `updatedAt` is the stale-edit token: the version of the entity the edit started from. */
  update: (
    session: Session,
    rulesetId: string,
    id: string,
    name: string,
    refs: Refs,
    updatedAt?: string,
  ) => Promise<Row>;
  remove: (session: Session, rulesetId: string, id: string) => Promise<unknown>;
};

const firstPage = { limit: 100, page: 1 };

const SERVICES: Record<string, Service> = {
  aptitudes: {
    list: (rulesetId, search) => AptitudesMethods.getRulesetAptitudes(rulesetId, { search }, firstPage),
    get: AptitudesMethods.getRulesetAptitude,
    create: (session, rulesetId, name) => AptitudesMethods.createRulesetAptitude(session, rulesetId, { name }),
    update: (session, rulesetId, id, name, _refs, updatedAt) =>
      AptitudesMethods.updateRulesetAptitude(session, rulesetId, id, { name, updatedAt }),
    remove: AptitudesMethods.deleteRulesetAptitude,
  },
  feats: {
    list: (rulesetId, search) => FeatsMethods.getRulesetFeats(rulesetId, { search }, firstPage),
    get: FeatsMethods.getRulesetFeat,
    create: (session, rulesetId, name, refs) =>
      FeatsMethods.createRulesetFeat(session, rulesetId, { name, aptitudeIds: [refs.featAptitudeId] }),
    update: (session, rulesetId, id, name, refs, updatedAt) =>
      FeatsMethods.updateRulesetFeat(session, rulesetId, id, { name, aptitudeIds: [refs.featAptitudeId], updatedAt }),
    remove: FeatsMethods.deleteRulesetFeat,
  },
  items: {
    list: (rulesetId, search) => ItemsMethods.getRulesetItems(rulesetId, { search }, firstPage),
    get: ItemsMethods.getRulesetItem,
    create: (session, rulesetId, name) => ItemsMethods.createRulesetItem(session, rulesetId, { name }),
    update: (session, rulesetId, id, name, _refs, updatedAt) =>
      ItemsMethods.updateRulesetItem(session, rulesetId, id, { name, updatedAt }),
    remove: ItemsMethods.deleteRulesetItem,
  },
  klasses: {
    list: (rulesetId, search) => ClassesMethods.getRulesetKlasses(rulesetId, { search }, firstPage),
    get: ClassesMethods.getRulesetKlass,
    create: (session, rulesetId, name) => ClassesMethods.createRulesetKlass(session, rulesetId, { name }),
    update: (session, rulesetId, id, name, _refs, updatedAt) =>
      ClassesMethods.updateRulesetKlass(session, rulesetId, id, { name, updatedAt }),
    remove: ClassesMethods.deleteRulesetKlass,
  },
  languages: {
    list: (rulesetId, search) => LanguagesMethods.getRulesetLanguages(rulesetId, { search }, firstPage),
    get: LanguagesMethods.getRulesetLanguage,
    create: (session, rulesetId, name) =>
      LanguagesMethods.createRulesetLanguage(session, rulesetId, { name, type: "Standard" }),
    update: (session, rulesetId, id, name, _refs, updatedAt) =>
      LanguagesMethods.updateRulesetLanguage(session, rulesetId, id, { name, type: "Standard", updatedAt }),
    remove: LanguagesMethods.deleteRulesetLanguage,
  },
  mechanics: {
    list: (rulesetId, search) => MechanicsMethods.getRulesetMechanics(rulesetId, { search }, firstPage),
    get: MechanicsMethods.getRulesetMechanic,
    create: (session, rulesetId, name) => MechanicsMethods.createRulesetMechanic(session, rulesetId, { name }),
    update: (session, rulesetId, id, name, _refs, updatedAt) =>
      MechanicsMethods.updateRulesetMechanic(session, rulesetId, id, { name, updatedAt }),
    remove: MechanicsMethods.deleteRulesetMechanic,
  },
  powers: {
    list: (rulesetId, search) => PowersMethods.getRulesetPowers(rulesetId, { search }, firstPage),
    get: PowersMethods.getRulesetPower,
    create: (session, rulesetId, name, refs) =>
      PowersMethods.createRulesetPower(session, rulesetId, { name, aptitudes: [{ id: refs.powerAptitudeId }] }),
    update: (session, rulesetId, id, name, refs, updatedAt) =>
      PowersMethods.updateRulesetPower(session, rulesetId, id, {
        name,
        aptitudes: [{ id: refs.powerAptitudeId }],
        updatedAt,
      }),
    remove: PowersMethods.deleteRulesetPower,
  },
  races: {
    list: (rulesetId, search) => RacesMethods.getRulesetRaces(rulesetId, { search }, firstPage),
    get: RacesMethods.getRulesetRace,
    create: (session, rulesetId, name) =>
      RacesMethods.createRulesetRace(session, rulesetId, { name, size: "Medium", baseSpeed: 30 }),
    update: (session, rulesetId, id, name, _refs, updatedAt) =>
      RacesMethods.updateRulesetRace(session, rulesetId, id, { name, size: "Medium", baseSpeed: 30, updatedAt }),
    remove: RacesMethods.deleteRulesetRace,
  },
  saves: {
    list: (rulesetId, search) => SavesMethods.getRulesetSaves(rulesetId, { search }, firstPage),
    get: SavesMethods.getRulesetSave,
    create: (session, rulesetId, name, refs) =>
      SavesMethods.createRulesetSave(session, rulesetId, { name, abilityId: refs.abilityId }),
    update: (session, rulesetId, id, name, refs, updatedAt) =>
      SavesMethods.updateRulesetSave(session, rulesetId, id, { name, abilityId: refs.abilityId, updatedAt }),
    remove: SavesMethods.deleteRulesetSave,
  },
  skills: {
    list: (rulesetId, search) => SkillsMethods.getRulesetSkills(rulesetId, { search }, firstPage),
    get: SkillsMethods.getRulesetSkill,
    create: (session, rulesetId, name, refs) =>
      SkillsMethods.createRulesetSkill(session, rulesetId, {
        name,
        primaryAbilityId: refs.abilityId,
        impactedByWeight: false,
        usableWithoutTraining: true,
      }),
    update: (session, rulesetId, id, name, refs, updatedAt) =>
      SkillsMethods.updateRulesetSkill(session, rulesetId, id, {
        name,
        primaryAbilityId: refs.abilityId,
        impactedByWeight: false,
        usableWithoutTraining: true,
        updatedAt,
      }),
    remove: SkillsMethods.deleteRulesetSkill,
  },
};

const ENTITY_TYPES = Object.keys(SERVICES);

/** A new user's empty ruleset, holding the rows entity bodies refer to. */
async function setup() {
  const { user, session, ruleset } = await createTestUserAndRuleset();
  const [ability] = await Abilities.create(db, { rulesetId: ruleset.id, name: "Strength", description: "Strength" });
  const featAptitude = await AptitudesMethods.createRulesetAptitude(session, ruleset.id, { name: "Feat Aptitude" });
  const powerAptitude = await AptitudesMethods.createRulesetAptitude(session, ruleset.id, { name: "Power Aptitude" });
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
    await expect(service.get(ruleset.id, created.id)).rejects.toThrow(NotFoundError);
  });

  test("throws NotFoundError for a missing ruleset or entity", async () => {
    const { session, ruleset, refs } = await setup();
    await expect(service.list(NIL_UUID)).rejects.toThrow(NotFoundError);
    await expect(service.get(ruleset.id, NIL_UUID)).rejects.toThrow(NotFoundError);
    await expect(service.create(session, NIL_UUID, "Missing", refs)).rejects.toThrow(NotFoundError);
    await expect(service.update(session, ruleset.id, NIL_UUID, "Missing", refs)).rejects.toThrow(NotFoundError);
    await expect(service.remove(session, ruleset.id, NIL_UUID)).rejects.toThrow(NotFoundError);
  });

  test("refuses writes from anyone but the owner, and through another ruleset", async () => {
    const { session, ruleset, refs } = await setup();
    const entity = await service.create(session, ruleset.id, "Guarded Entity", refs);
    const { session: other, ruleset: otherRuleset } = await createTestUserAndRuleset();

    await expect(service.create(other, ruleset.id, "Intruder", refs)).rejects.toThrow(ForbiddenError);
    await expect(service.update(other, ruleset.id, entity.id, "Hijacked", refs)).rejects.toThrow(ForbiddenError);
    await expect(service.remove(other, ruleset.id, entity.id)).rejects.toThrow(ForbiddenError);
    // Reading it through a ruleset it isn't part of doesn't find it either.
    await expect(service.get(otherRuleset.id, entity.id)).rejects.toThrow(NotFoundError);
  });

  test("refuses an edit started from a stale copy, unless it sends no token", async () => {
    const { session, ruleset, refs } = await setup();
    const created = await service.create(session, ruleset.id, "Contested Entity", refs);
    await service.update(session, ruleset.id, created.id, "First Edit", refs, created.updatedAt);
    await expect(
      service.update(session, ruleset.id, created.id, "Second Edit", refs, created.updatedAt),
    ).rejects.toThrow(ConflictError);
    expect(await service.update(session, ruleset.id, created.id, "Tokenless Edit", refs)).toMatchObject({
      name: "Tokenless Edit",
    });
  });

  test("refuses a name the ruleset already uses", async () => {
    const { session, ruleset, refs } = await setup();
    await service.create(session, ruleset.id, "Taken Name", refs);
    await expect(service.create(session, ruleset.id, "Taken Name", refs)).rejects.toThrow(ConflictError);
  });

  test("copies an inherited entity into the fork on edit, and refuses a name the parent uses", async () => {
    const { session: parentSession, ruleset: parent, refs } = await setup();
    const inherited = await service.create(parentSession, parent.id, "Inherited Entity", refs);
    const { user, session } = await createTestUserAndRuleset();
    const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });

    await expect(service.create(session, fork.id, "Inherited Entity", refs)).rejects.toThrow(ConflictError);

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

// Mechanics can't be customized, so nothing can point at them.
describe.each(ENTITY_TYPES.filter((type) => type !== "mechanics"))("customized %s", (entityType) => {
  const service = SERVICES[entityType];
  const ownsModifiers = isCustomizableEntityType(entityType);

  /** Gives the entity a requirement, a property and, when its type can own one, a modifier with a requirement of its own. */
  async function customize(id: string) {
    if (ownsModifiers) {
      const [modifier] = await Modifiers.create(db, {
        sourceId: id,
        sourceType: entityType,
        target: "abilities.strength.misc",
        value: "2",
        valueType: "number",
        operator: "add",
      });
      await Requirements.create(db, {
        entityId: modifier.id,
        entityType: "modifiers",
        level: "1",
        chainingOperator: "and",
      });
    }
    await Requirements.create(db, {
      entityId: id,
      entityType,
      level: "1",
      target: "abilities.strength.total",
      value: "13",
      valueType: "number",
      operator: "greater_than_or_equal",
    });
    await Properties.create(db, { entityId: id, entityType, type: "NOTE", value: "doomed" });
  }

  /** The entity's customizations, and the ids of its modifiers' requirements. */
  async function customizationsOf(id: string) {
    const modifiers = await Modifiers.findManyBySource(db, { sourceIds: [id], sourceType: entityType });
    const modifierRequirements = await Requirements.findManyByEntity(db, {
      entityIds: modifiers.map((m) => m.id),
      entityType: "modifiers",
    });
    return {
      modifiers,
      modifierRequirementIds: modifierRequirements.map((r) => r.id),
      requirements: await Requirements.findManyByEntity(db, { entityIds: [id], entityType }),
      properties: await Properties.findManyByEntity(db, { entityIds: [id], entityType, type: "NOTE" }),
    };
  }

  /** How many of each an entity has. */
  const counts = async (id: string) => {
    const { modifiers, modifierRequirementIds, requirements, properties } = await customizationsOf(id);
    return {
      modifiers: modifiers.length,
      modifierRequirements: modifierRequirementIds.length,
      requirements: requirements.length,
      properties: properties.length,
    };
  };
  const none = { modifiers: 0, modifierRequirements: 0, requirements: 0, properties: 0 };
  const one = {
    modifiers: Number(ownsModifiers),
    modifierRequirements: Number(ownsModifiers),
    requirements: 1,
    properties: 1,
  };

  /** Whether any of these requirements is left. */
  const remaining = async (ids: string[]) =>
    (await Promise.all(ids.map((id) => Requirements.findOne(db, { id })))).filter(Boolean);

  test("deletes the entity's modifiers, requirements and properties with it", async () => {
    const { session, ruleset, refs } = await setup();
    const { id } = await service.create(session, ruleset.id, "Doomed Entity", refs);
    // Customizations point at their entity polymorphically: no foreign key removes them.
    await customize(id);
    const { modifierRequirementIds } = await customizationsOf(id);

    await service.remove(session, ruleset.id, id);
    expect(await counts(id)).toEqual(none);
    expect(await remaining(modifierRequirementIds)).toEqual([]);
  });

  test("copies an inherited entity's customizations into the fork, and deletes them with the copy", async () => {
    const { session: parentSession, ruleset: parent, refs } = await setup();
    const inherited = await service.create(parentSession, parent.id, "Inherited Entity", refs);
    await customize(inherited.id);
    const { user, session } = await createTestUserAndRuleset();
    const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });

    const source = await customizationsOf(inherited.id);

    const copy = await service.update(session, fork.id, inherited.id, "Forked Entity", refs);
    expect(await counts(copy.id)).toEqual(one);
    const copied = await customizationsOf(copy.id);
    // The copy's modifier has its own copy of the modifier's requirements.
    expect(copied.modifierRequirementIds.filter((id) => source.modifierRequirementIds.includes(id))).toEqual([]);

    await service.remove(session, fork.id, inherited.id);
    expect(await counts(copy.id)).toEqual(none);
    expect(await remaining(copied.modifierRequirementIds)).toEqual([]);
    expect(await customizationsOf(inherited.id)).toEqual(source);
  });
});
