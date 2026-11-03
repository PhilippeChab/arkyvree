import { expect, test } from "bun:test";

import RequirementEvaluator from "@/engine/core/requirements/RequirementEvaluator.ts";
import Dnd35TargetPaths from "@/engine/rulesets/dnd3.5/Dnd35TargetPaths.ts";
import type { Aptitude, Feat, RulesetAbility, Spell } from "@/engine/rulesets/dnd3.5/index.ts";
import AbilitiesComponent from "@/engine/rulesets/dnd3.5/model/abilities/AbilitiesComponent.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { fetchEveryPage } from "@/server/repositories/concerns/Paginates.ts";
import { Entities, Modifiers, Requirements, Rulesets } from "@/server/repositories/index.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import type { Requirement } from "@/shared/relations.ts";
import { addLists } from "@/tests/support/dnd3.5/links.ts";
import { compareCopies, customizationsOf } from "@/tests/support/dnd3.5/siblingCopies.ts";
import { writeFieldValues } from "@/tests/support/ownerValues.ts";
import {
  copyEntity,
  createSeededTestRuleset,
  createSeededTestRulesetWithExtensions,
  invalidateTestRulesets,
  ownerSessionOf,
  readView,
} from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";
import { FEAT_FAMILY } from "@/vocabulary/dnd3.5/fields/index.ts";

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
    await configure(extension.id, host.rulesetId!, i);
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
  return { session, host, rulesetIds: [host.id, ...extensionIds] };
}

test("a list leaves out a book's copy that lost to another book's in its query: its pages are full", async () => {
  const fork = await createSeededTestRulesetWithExtensions(makeSession().userId);
  const staleIds = await withRulesetScope(db, fork.id, async ({ rulesetData }) => {
    expect(rulesetData.cow.siblingIds.size).toBeGreaterThan(0);
    return new Set(rulesetData.cow.getStaleIds());
  });
  const pagination = (page: number) => ({ limit: 100, page });
  for (const getPage of [
    async (page: number) =>
      EntitiesService.getEntities(await ownerSessionOf(fork.id), fork.id, "spells", {}, pagination(page)),
    async (page: number) =>
      EntitiesService.getEntities(await ownerSessionOf(fork.id), fork.id, "feats", {}, pagination(page)),
    async (page: number) =>
      EntitiesService.getEntities(await ownerSessionOf(fork.id), fork.id, "classes", {}, pagination(page)),
    async (page: number) =>
      EntitiesService.getEntities(await ownerSessionOf(fork.id), fork.id, "aptitudes", {}, pagination(page)),
  ]) {
    const pages = await readPages(getPage);
    expect(pages.slice(0, -1).every((ids) => ids.length === 100)).toBe(true);
    expect(pages.flat().filter((id) => staleIds.has(id))).toEqual([]);
  }
}, 30_000);

test("editing a shared aptitude preserves references from both extensions", async () => {
  const aptitudeIds: string[] = [];
  const featIds: string[] = [];
  const { session, host, rulesetIds } = await setup(async (rulesetId, _baseId, index) => {
    const [aptitude] = await Entities.create<Aptitude>(db, "aptitudes", { rulesetId, name: "Audit Shared Pool" });
    const [feat] = await Entities.create<Feat>(db, "feats", { rulesetId, name: `Audit Pool Feat ${index}` });
    await addLists(db, "feats", feat.id, [{ toId: aptitude.id }]);
    aptitudeIds.push(aptitude.id);
    featIds.push(feat.id);
  });
  const read = () =>
    withRulesetScope(db, host.id, async ({ rulesetData }) => ({
      resolved: aptitudeIds.map((id) => Dnd35View.of(rulesetData).aptitudesById.get(id)?.id),
      links: featIds.map((id) => Dnd35View.of(rulesetData).listLinksOf(id)[0].toId),
    }));
  expect(await read()).toEqual({ resolved: [aptitudeIds[0], aptitudeIds[0]], links: [aptitudeIds[0], aptitudeIds[0]] });
  const local = await EntitiesService.updateEntity(session, host.id, "aptitudes", aptitudeIds[0], {
    name: "Audit Local Pool",
  });
  const warm = await read();
  invalidateTestRulesets(...rulesetIds);
  const cold = await read();
  expect({ warm, cold }).toEqual({
    warm: { resolved: [local.id, local.id], links: [local.id, local.id] },
    cold: { resolved: [local.id, local.id], links: [local.id, local.id] },
  });
  await EntitiesService.updateEntity(session, host.id, "aptitudes", local.id, { name: "Renamed Local Pool" });
  expect(await read()).toEqual({ resolved: [local.id, local.id], links: [local.id, local.id] });
  for (const id of aptitudeIds)
    expect((await Entities.findOne<Aptitude>(db, { entityType: "aptitudes", id }))?.name).toBe("Audit Shared Pool");
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
    const { session, host, rulesetIds } = await setup(async (rulesetId, baseId, index) => {
      const source = (await Entities.findOne<Feat>(db, { entityType: "feats", rulesetId: baseId, name: "Toughness" }))!;
      const copy = await copyEntity(db, "feats", source.id, { id: rulesetId });
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
      Entities.findPage<RulesetAbility>(db, { entityType: "abilities", rulesetId: host.rulesetId! }, pagination),
    );
    // The base's scores, each its `score` link, its ability named by the base's view
    const base = (await Rulesets.findOne(db, { id: host.rulesetId! }))!;
    const scoreLinks = rows.map((row) => ({
      amount: row.name === "Strength" ? 13 : 10,
      characterId: NIL_UUID,
      createdAt: "",
      entityId: row.id,
      updatedAt: "",
    }));
    abilities.initialize({ abilityPicks: [], scoreLinks }, { ruleset: base, rulesetData: await readView(base.id) });
    const evaluate = (groups: Requirement[][]) => {
      const engine = new RequirementEvaluator(new Dnd35TargetPaths());
      engine.evaluateRequirements({ abilities }, groups);
      const result = engine.getRequirements();
      expect(result.invalidRequirements).toHaveLength(0);
      return result.unmetRequirementGroups.length === 0;
    };
    // Each copy's own requirements, as stored
    const stored = async () => {
      const groups = [];
      for (const entityId of copies)
        groups.push(await Requirements.findMany(db, { entityIds: [entityId], entityType: "feats" }));
      return groups;
    };
    const originals = await stored();
    const expected = evaluate(originals);
    expect(expected).toBe(chainingOperator === "or");
    const read = () =>
      withRulesetScope(db, host.id, async ({ rulesetData }) => rulesetData.requirementsByEntity.get(copies[0]) ?? []);
    const before = evaluate([await read()]);
    await EntitiesService.updateEntity(session, host.id, "feats", copies[0], {
      name: "Toughness",
      fields: { [FEAT_FAMILY]: ["Luck"] },
    });
    const after = evaluate([await read()]);
    invalidateTestRulesets(...rulesetIds);
    const cold = evaluate([await read()]);
    expect({ before, after, cold }).toEqual({ before: expected, after: expected, cold: expected });
    expect(await stored()).toEqual(originals);
  });
}

// Three books copy Toughness and Fireball: the first's copies win; the other two give theirs equal rows that differ
// otherwise: a modifier with a requirement of its own, a condition and a group of conditions, and Fireball's link to
// Cleric Spells at a level of its own. Toughness's families are a set: the host reads every book's, once each
test("a sibling winner takes, of equal rows, the first sibling's, and so does its copy", async () => {
  const condition = { operator: "greater_than_or_equal", valueType: "number" };
  const { host } = await setup(
    async (rulesetId, baseId, index) => {
      const feat = (await Entities.findOne<Feat>(db, { entityType: "feats", rulesetId: baseId, name: "Toughness" }))!;
      const spell = (await Entities.findOne<Spell>(db, { entityType: "spells", rulesetId: baseId, name: "Fireball" }))!;
      const featCopy = await copyEntity(db, "feats", feat.id, { id: rulesetId });
      const spellCopy = await copyEntity(db, "spells", spell.id, { id: rulesetId });
      const owner = { entityId: featCopy.id, entityType: "feats" };
      await writeFieldValues("feats", featCopy.id, [[FEAT_FAMILY, "shared"]]);
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
      await writeFieldValues("feats", featCopy.id, [
        [FEAT_FAMILY, "shared"],
        [FEAT_FAMILY, "sibling"],
      ]);
      const clericSpells = (await Entities.findOne<Aptitude>(db, {
        entityType: "aptitudes",
        rulesetId: baseId,
        name: "Cleric Spells",
      }))!;
      await addLists(db, "spells", spellCopy.id, [{ toId: clericSpells.id, tier: 3 + index }]);
    },
    false,
    3,
  );
  const baseId = host.rulesetId!;
  const fork = (await Rulesets.findOne(db, { id: host.id }))!;
  const view = await readView(fork.id);
  const featId = view.cow.resolve(
    (await Entities.findOne<Feat>(db, { entityType: "feats", rulesetId: baseId, name: "Toughness" }))!.id,
  );
  const spellId = view.cow.resolve(
    (await Entities.findOne<Spell>(db, { entityType: "spells", rulesetId: baseId, name: "Fireball" }))!.id,
  );
  const clericSpells = (await Entities.findOne<Aptitude>(db, {
    entityType: "aptitudes",
    rulesetId: baseId,
    name: "Cleric Spells",
  }))!;
  const feat = customizationsOf(view, featId);
  expect(feat.modifiers.filter((m) => m.startsWith("abilities.dexterity"))).toEqual([
    "abilities.dexterity.misc|add|2|number|1||abilities.wisdom.total|greater_than_or_equal|11|number",
  ]);
  expect(feat.values.filter((value) => value.startsWith(FEAT_FAMILY))).toEqual([
    `${FEAT_FAMILY}|shared`,
    `${FEAT_FAMILY}|sibling`,
  ]);
  expect(feat.requirements.filter((r) => r.includes("strength"))).toHaveLength(1);
  expect(feat.requirements.filter((r) => r.includes("|or|"))).toHaveLength(2);
  expect(customizationsOf(view, spellId).links).toContain(`${clericSpells.id}|4`);
  expect(await compareCopies(fork, [featId, spellId])).toEqual({ compared: 2, mismatches: [] });
});
