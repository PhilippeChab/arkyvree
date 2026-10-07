import { afterEach, expect, test } from "bun:test";

import { RulesetCache, type RulesetData, withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { type Db, db, withCowContext, withTransaction } from "@/server/database/index.ts";
import { fetchEveryPage } from "@/server/repositories/concerns/Paginates.ts";
import {
  Abilities,
  Aptitudes,
  Feats,
  FeatsAptitudes,
  KlassLevelFeats,
  KlassLevelPowers,
  KlassLevels,
  Modifiers,
  Powers,
  PowersAptitudes,
  Properties,
  Requirements,
  type RulesetEntityType,
  Rulesets,
} from "@/server/repositories/index.ts";
import AbilitiesComponent from "@/server/rulesets/dnd3.5/abilities/AbilitiesComponent.ts";
import Dnd35TargetPaths from "@/server/rulesets/dnd3.5/Dnd35TargetPaths.ts";
import RequirementEvaluator from "@/server/rulesets/engine/requirements/RequirementEvaluator.ts";
import { AptitudesService } from "@/server/services/rulesets/aptitudes/index.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { ClassesService } from "@/server/services/rulesets/classes/index.ts";
import { PropertiesService } from "@/server/services/rulesets/customization/properties/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import { PowersService } from "@/server/services/rulesets/powers/index.ts";
import type { Requirement } from "@/shared/relations.ts";
import {
  copyEntity,
  createSeededTestRuleset,
  createSeededTestRulesetWithExtensions,
  editRuleset,
} from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";

/** A winner's merged customizations, as the view shows them: their content, not their ids. */
function customizationsOf(data: RulesetData, id: string) {
  const requirementsOf = (entityId: string) =>
    (data.requirementsByEntity.get(entityId) ?? [])
      .map((r) => [r.level, r.chainingOperator, r.target, r.operator, r.value, r.valueType].join("|"))
      .sort();
  return {
    modifiers: (data.modifiersBySource.get(id) ?? [])
      .map((m) => [m.target, m.operator, m.value, m.valueType, ...requirementsOf(m.id)].join("|"))
      .sort(),
    properties: (data.propertiesByEntity.get(id) ?? []).map((p) => [p.type, p.value, p.description].join("|")).sort(),
    requirements: requirementsOf(id),
    links: [
      ...(data.featsById.get(id)?.featsAptitudesInRules.map((l) => l.aptitudeId) ?? []),
      ...(data.powersById.get(id)?.powersAptitudesInRules.map((l) => `${l.aptitudeId}|${l.level}`) ?? []),
    ].sort(),
  };
}

/** The entity type of a feat, a power or an item of the view. */
function typeOf(data: RulesetData, id: string): RulesetEntityType | undefined {
  if (data.featsById.has(id)) return "feats";
  if (data.powersById.has(id)) return "powers";
  if (data.aptitudesById.has(id)) return "aptitudes";
  return data.itemsById.has(id) ? "items" : undefined;
}

/**
 * Copies each winner into the ruleset, in a transaction rolled back, and compares the copy's customizations in the view
 * with the winner's before it was copied: the winners compared, and the mismatches, by winner and kind.
 */
async function compareCopies(
  ruleset: { ancestorRulesetIds: string[]; extensionRulesetIds: string[]; id: string },
  winnerIds: string[],
) {
  const before = await RulesetCache.getData(ruleset);
  const mismatches: string[] = [];
  let compared = 0;
  for (const winnerId of winnerIds) {
    const type = typeOf(before, winnerId);
    if (!type) continue;
    compared++;
    const expected = customizationsOf(before, winnerId);
    await withTransaction(async (tx) => {
      const edit = await editRuleset(ruleset);
      const { id: copyId } = await edit.cowToEdit(tx, type, { id: winnerId, rulesetId: "inherited" });
      RulesetCache.invalidate(ruleset.id);
      const after = await RulesetCache.getData(ruleset);
      const actual = customizationsOf(after, copyId);
      for (const kind of ["modifiers", "properties", "requirements", "links"] as const) {
        if (JSON.stringify(actual[kind]) === JSON.stringify(expected[kind])) continue;
        mismatches.push(`${type} ${winnerId} ${kind}: view ${expected[kind]} copy ${actual[kind]}`);
      }
      const stale = await findStaleAptitudeIds(tx, after, type, copyId);
      if (stale.length > 0) mismatches.push(`${type} ${winnerId} stores links to losing lists: ${stale}`);
      throw new Rollback();
    }).catch((error) => {
      if (!(error instanceof Rollback)) throw error;
    });
    RulesetCache.invalidate(ruleset.id);
  }
  return { compared, mismatches };
}

/**
 * The aptitudes a copy's links store that its ruleset's view resolves to another (a losing copy of a list), read by
 * their stored ids: a feat's or a power's lists, a class's levels' granted feats' and powers'. None, for a right copy.
 */
async function findStaleAptitudeIds(tx: Db, view: RulesetData, type: RulesetEntityType, copyId: string) {
  const links = await withCowContext(undefined, async () => {
    if (type === "feats") return await FeatsAptitudes.findMany(tx, { featId: copyId });
    if (type === "powers") return await PowersAptitudes.findMany(tx, { powerId: copyId });
    if (type !== "klasses") return [];
    const klassLevelIds = (await KlassLevels.findMany(tx, { klassId: copyId })).map((level) => level.id);
    return [
      ...(await KlassLevelFeats.findMany(tx, { klassLevelIds })),
      ...(await KlassLevelPowers.findMany(tx, { klassLevelIds })),
    ];
  });
  return links.map((link) => link.aptitudeId).filter((id) => view.canonicalize(id) !== id);
}

/** Every page of a list, by its size and its ids. */
async function readPages(getPage: (page: number) => Promise<{ items: { id: string }[]; nextPage?: number }>) {
  const pages: string[][] = [];
  let page: number | undefined = 1;
  while (page) {
    const result = await getPage(page);
    pages.push(result.items.map((item) => item.id));
    page = result.nextPage;
  }
  return pages;
}

async function setup(
  configure: (extensionId: string, baseId: string, index: number) => Promise<void>,
  reverseOrder = false,
  extensionCount = 2,
) {
  const session = makeSession();
  const host = await createSeededTestRuleset(session.userId);
  const extensionIds: string[] = [];
  for (let i = 0; i < extensionCount; i++) {
    const extension = await createSeededTestRuleset(session.userId);
    await configure(extension.id, host.ancestorRulesetIds[0], i);
    await Rulesets.update(
      db,
      { kind: "extension", status: "Published", private: false, userId: null },
      { id: extension.id },
    );
    extensionIds.push(extension.id);
  }
  await RulesetExtensionsService.subscribeExtension(
    session,
    host.id,
    reverseOrder ? [...extensionIds].reverse() : extensionIds,
  );
  return { session, host };
}

class Rollback extends Error {}

afterEach(() => RulesetCache.invalidateAll());

test("a list leaves out a book's copy that lost to another book's in its query: its pages are full", async () => {
  const fork = await createSeededTestRulesetWithExtensions(makeSession().userId);
  const staleIds = await withRulesetScope(db, fork.id, async ({ rulesetData }) => {
    expect(rulesetData.cow.siblingIds.size).toBeGreaterThan(0);
    return new Set(rulesetData.cow.getStaleIds());
  });
  const pagination = (page: number) => ({ limit: 100, page });
  for (const getPage of [
    (page: number) => PowersService.getPowers(fork.id, {}, pagination(page)),
    (page: number) => FeatsService.getFeats(fork.id, {}, pagination(page)),
    (page: number) => ClassesService.getClasses(fork.id, {}, pagination(page)),
    (page: number) => AptitudesService.getAptitudes(fork.id, {}, pagination(page)),
  ]) {
    const pages = await readPages(getPage);
    expect(pages.slice(0, -1).every((ids) => ids.length === 100)).toBe(true);
    expect(pages.flat().filter((id) => staleIds.has(id))).toEqual([]);
  }
}, 30_000);

test("editing a shared aptitude preserves references from both extensions", async () => {
  const aptitudeIds: string[] = [];
  const featIds: string[] = [];
  const { session, host } = await setup(async (rulesetId, _baseId, index) => {
    const [aptitude] = await Aptitudes.create(db, { rulesetId, name: "Audit Shared Pool" });
    const [feat] = await Feats.create(db, { rulesetId, name: `Audit Pool Feat ${index}` });
    await FeatsAptitudes.create(db, { featId: feat.id, aptitudeId: aptitude.id });
    aptitudeIds.push(aptitude.id);
    featIds.push(feat.id);
  });
  const read = () =>
    withRulesetScope(db, host.id, async ({ rulesetData }) => ({
      resolved: aptitudeIds.map((id) => rulesetData.aptitudesById.get(id)?.id),
      links: featIds.map((id) => rulesetData.featsById.get(id)!.featsAptitudesInRules[0].aptitudeId),
    }));
  expect(await read()).toEqual({ resolved: [aptitudeIds[0], aptitudeIds[0]], links: [aptitudeIds[0], aptitudeIds[0]] });
  const local = await AptitudesService.updateAptitude(session, host.id, aptitudeIds[0], {
    name: "Audit Local Pool",
  });
  const warm = await read();
  RulesetCache.invalidateAll();
  const cold = await read();
  expect({ warm, cold }).toEqual({
    warm: { resolved: [local.id, local.id], links: [local.id, local.id] },
    cold: { resolved: [local.id, local.id], links: [local.id, local.id] },
  });
  await AptitudesService.updateAptitude(session, host.id, local.id, { name: "Renamed Local Pool" });
  expect(await read()).toEqual({ resolved: [local.id, local.id], links: [local.id, local.id] });
  for (const id of aptitudeIds) expect((await Aptitudes.findOne(db, { id }))?.name).toBe("Audit Shared Pool");
  await RulesetChangesService.revertOverride(session, host.id, "aptitudes", aptitudeIds[0]);
  expect(await read()).toEqual({ resolved: [aptitudeIds[0], aptitudeIds[0]], links: [aptitudeIds[0], aptitudeIds[0]] });
});

for (const [chainingOperator, reverseOrder] of [
  ["or", false],
  ["and", false],
  ["or", true],
] as const) {
  test(`merging A with (${chainingOperator === "or" ? "A OR B" : "A AND B"}) preserves eligibility before and after COW (reverse=${reverseOrder})`, async () => {
    const copies: string[] = [];
    const { session, host } = await setup(async (rulesetId, baseId, index) => {
      const source = (await Feats.findOne(db, { rulesetId: baseId, name: "Toughness" }))!;
      const copy = await copyEntity(db, "feats", source.id, {
        id: rulesetId,
        extensionRulesetIds: [],
        ancestorRulesetIds: [baseId],
      });
      copies.push(copy.id);
      const owner = { entityId: copy.id, entityType: "feats" };
      const conditionA = {
        target: "abilities.strength.total",
        operator: "greater_than_or_equal",
        value: "13",
        valueType: "number",
      };
      if (index === 0) {
        await Requirements.create(db, { ...owner, ...conditionA, level: "1" });
      } else {
        await Requirements.createMany(db, [
          { ...owner, level: "1", chainingOperator },
          { ...owner, ...conditionA, level: "1.1" },
          { ...owner, ...conditionA, target: "abilities.dexterity.total", value: "15", level: "1.2" },
        ]);
      }
    }, reverseOrder);
    const abilities = new AbilitiesComponent();
    const rows = await fetchEveryPage((pagination) =>
      Abilities.findPage(db, { rulesetId: host.ancestorRulesetIds[0], ancestorRulesetIds: [] }, pagination),
    );
    abilities.initialize(
      rows.map((row) => ({ abilityId: row.id, name: row.name, score: row.name === "Strength" ? 13 : 10 })),
      [],
    );
    const evaluate = (groups: Requirement[][]) => {
      const engine = new RequirementEvaluator(new Dnd35TargetPaths());
      engine.evaluateRequirements({ abilities }, groups);
      const result = engine.getRequirements();
      expect(result.invalidRequirements).toHaveLength(0);
      return result.unmetRequirementGroups.length === 0;
    };
    const originals = await Promise.all(
      copies.map((entityId) => Requirements.findMany(db, { entityIds: [entityId], entityType: "feats" })),
    );
    const expected = evaluate(originals);
    expect(expected).toBe(chainingOperator === "or");
    const read = () =>
      withRulesetScope(db, host.id, async ({ rulesetData }) => rulesetData.requirementsByEntity.get(copies[0]) ?? []);
    const before = evaluate([await read()]);
    await PropertiesService.createProperty(session, host.id, "feats", copies[0], { type: "AUDIT", value: "1" });
    const after = evaluate([await read()]);
    RulesetCache.invalidateAll();
    const cold = evaluate([await read()]);
    expect({ before, after, cold }).toEqual({ before: expected, after: expected, cold: expected });
    expect(
      await Promise.all(
        copies.map((entityId) => Requirements.findMany(db, { entityIds: [entityId], entityType: "feats" })),
      ),
    ).toEqual(originals);
  });
}

test("a sibling winner's copy holds what the view showed of it, for every winner of a fork of every extension", async () => {
  const fork = await createSeededTestRulesetWithExtensions(makeSession().userId);
  const { cow } = await RulesetCache.getData(fork);
  const winnerIds = [...new Set([...cow.siblingIds].flatMap((loserId) => cow.getWinner(loserId) ?? []))].sort();
  const { compared, mismatches } = await compareCopies(fork, winnerIds);
  expect(compared).toBeGreaterThan(100);
  expect(mismatches).toEqual([]);
}, 600_000);

test("a copied class's levels store the lists that stand for their granted feats' and powers' lists", async () => {
  const fork = await createSeededTestRulesetWithExtensions(makeSession().userId);
  const view = await RulesetCache.getData(fork);
  const klassIds = [...new Set([...view.klassesById.values()].map((klass) => klass.id))].sort();
  const stale: string[] = [];
  for (const klassId of klassIds) {
    await withTransaction(async (tx) => {
      const edit = await editRuleset(fork);
      const { id: copyId } = await edit.cowToEdit(tx, "klasses", { id: klassId, rulesetId: "inherited" });
      RulesetCache.invalidate(fork.id);
      const ids = await findStaleAptitudeIds(tx, await RulesetCache.getData(fork), "klasses", copyId);
      if (ids.length > 0) stale.push(`${view.klassesById.get(klassId)?.name}: ${ids}`);
      throw new Rollback();
    }).catch((error) => {
      if (!(error instanceof Rollback)) throw error;
    });
    RulesetCache.invalidate(fork.id);
  }
  expect(klassIds.length).toBeGreaterThan(50);
  expect(stale).toEqual([]);
}, 600_000);

// Three books copy Toughness and Fireball: the first's copies win; the other two give theirs equal rows that differ
// otherwise: a modifier with a requirement of its own, a property with a description of its own, a condition and a
// group of conditions, and Fireball's link to Cleric Spells at a level of its own
test("a sibling winner takes, of equal rows, the first sibling's, and so does its copy", async () => {
  const condition = { operator: "greater_than_or_equal", valueType: "number" };
  const { host } = await setup(
    async (rulesetId, baseId, index) => {
      const feat = (await Feats.findOne(db, { rulesetId: baseId, name: "Toughness" }))!;
      const power = (await Powers.findOne(db, { rulesetId: baseId, name: "Fireball" }))!;
      const featCopy = await copyEntity(db, "feats", feat.id, {
        id: rulesetId,
        extensionRulesetIds: [],
        ancestorRulesetIds: [baseId],
      });
      const powerCopy = await copyEntity(db, "powers", power.id, {
        id: rulesetId,
        extensionRulesetIds: [],
        ancestorRulesetIds: [baseId],
      });
      const owner = { entityId: featCopy.id, entityType: "feats" };
      const description = index === 0 ? "the winner's" : `sibling ${index}'s`;
      await Properties.create(db, { ...owner, type: "AUDIT", value: "shared", description });
      if (index === 0) return;
      const [modifier] = await Modifiers.create(db, {
        sourceId: featCopy.id,
        sourceType: "feats",
        target: "abilities.dexterity.misc",
        operator: "add",
        value: "2",
        valueType: "number",
      });
      const wisdom = { ...condition, target: "abilities.wisdom.total", value: String(10 + index) };
      await Requirements.createMany(db, [
        { entityId: modifier.id, entityType: "modifiers", level: "1", ...wisdom },
        { ...owner, ...condition, level: "1", target: "abilities.strength.total", value: "13" },
        { ...owner, level: "2", chainingOperator: "or" },
        { ...owner, ...condition, level: "2.1", target: "abilities.dexterity.total", value: String(10 + index) },
        { ...owner, ...condition, level: "2.2", target: "abilities.constitution.total", value: String(10 + index) },
      ]);
      await Properties.create(db, { ...owner, type: "AUDIT", value: "sibling", description });
      const clericSpells = (await Aptitudes.findOne(db, { rulesetId: baseId, name: "Cleric Spells" }))!;
      await PowersAptitudes.create(db, { powerId: powerCopy.id, aptitudeId: clericSpells.id, level: 3 + index });
    },
    false,
    3,
  );
  const baseId = host.ancestorRulesetIds[0];
  const fork = (await Rulesets.findOne(db, { id: host.id }))!;
  const view = await RulesetCache.getData(fork);
  const featId = view.cow.resolve((await Feats.findOne(db, { rulesetId: baseId, name: "Toughness" }))!.id);
  const powerId = view.cow.resolve((await Powers.findOne(db, { rulesetId: baseId, name: "Fireball" }))!.id);
  const clericSpells = (await Aptitudes.findOne(db, { rulesetId: baseId, name: "Cleric Spells" }))!;
  const feat = customizationsOf(view, featId);
  expect(feat.modifiers.filter((m) => m.startsWith("abilities.dexterity"))).toEqual([
    "abilities.dexterity.misc|add|2|number|1||abilities.wisdom.total|greater_than_or_equal|11|number",
  ]);
  expect(feat.properties.filter((p) => p.startsWith("AUDIT"))).toEqual([
    "AUDIT|shared|the winner's",
    "AUDIT|sibling|sibling 1's",
  ]);
  expect(feat.requirements.filter((r) => r.includes("strength"))).toHaveLength(1);
  expect(feat.requirements.filter((r) => r.includes("|or|"))).toHaveLength(2);
  expect(customizationsOf(view, powerId).links).toContain(`${clericSpells.id}|4`);
  expect(await compareCopies(fork, [featId, powerId])).toEqual({ compared: 2, mismatches: [] });
});
