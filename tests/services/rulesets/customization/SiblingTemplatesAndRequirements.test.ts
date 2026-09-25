import { afterEach, expect, test } from "bun:test";
import { db } from "@/server/database/index.ts";
import { Feats, Items, Properties, Requirements, Rulesets, Sessions } from "@/server/repositories/index.ts";
import { createSeededTestRuleset } from "@/tests/helpers.ts";
import { cowEntity, withRulesetScope } from "@/server/services/rulesets/cow.ts";
import { RulesetsMethods } from "@/server/services/RulesetsService.ts";
import { ItemsMethods } from "@/server/services/rulesets/ItemsService.ts";
import { PropertiesMethods } from "@/server/services/rulesets/customization/PropertiesService.ts";
import { RequirementsMethods } from "@/server/services/rulesets/customization/RequirementsService.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { application } from "@/server/routers/application.ts";
import { testClient } from "hono/testing";
import { invalidateAll } from "@/server/cache/rulesetCache.ts";

afterEach(invalidateAll);

async function setup(entityType: "items" | "feats", configure?: (copyId: string, index: number) => Promise<void>, extensionCount = 2) {
  const session = (await Sessions.findOne(db, { id: "00000000-0000-4000-8000-000000000123" }))!;
  const host = await createSeededTestRuleset(session.userId);
  const source = entityType === "items"
    ? (await Items.create(db, { rulesetId: host.ancestorRulesetIds[0], name: "Audit Template", isTemplate: true }))[0]
    : (await Feats.findOne(db, { rulesetId: host.ancestorRulesetIds[0], name: "Toughness" }))!;
  const copies: string[] = [];
  const extensionIds: string[] = [];
  for (let i = 0; i < extensionCount; i++) {
    const extension = await createSeededTestRuleset(session.userId);
    const copy = await cowEntity(db, entityType, source.id, extension.id, extension.ancestorRulesetIds, []);
    copies.push(copy.id);
    extensionIds.push(extension.id);
    if (configure) {
      await configure(copy.id, i);
    } else if (entityType === "items") {
      await Properties.create(db, { entityId: copy.id, entityType, type: `AUDIT_PROPERTY_${i}`, value: String(i) });
    } else if (i === 1) {
      await Requirements.create(db, { entityId: copy.id, entityType, level: "1", target: "abilities.strength.total", operator: "greater_than_or_equal", value: "13", valueType: "number" });
    }
    await Rulesets.update(db, { kind: "extension", status: "Published", private: false, userId: null }, { id: extension.id });
  }
  await RulesetsMethods.subscribeExtension(session, host.id, extensionIds);
  return { session, host, source, copies };
}

for (const index of [0, 1]) {
  test(`derived item can override template property from extension ${index}`, async () => {
    const { session, host, source } = await setup("items");
    const item = await ItemsMethods.duplicateRulesetItem(session, host.id, source.id, { name: "Audit Derived Item" });
    const before = await ItemsMethods.getRulesetItem(host.id, item.id);
    const property = before.properties.find(p => p.type === `AUDIT_PROPERTY_${index}`)!;
    expect(property).toBeDefined();
    const original = await Properties.findOne(db, { id: property.id });
    await PropertiesMethods.updateEntityProperty(session, host.id, "items", item.id, property.id, { type: property.type, value: "99" });
    expect(await Properties.findOne(db, { id: property.id })).toEqual(original);
    const after = await ItemsMethods.getRulesetItem(host.id, item.id);
    expect(after.properties.filter(p => p.type === property.type).map(p => p.value)).toEqual(["99"]);
  });
}

for (const action of ["update", "delete"] as const) {
  test(`visible sibling requirement can be ${action}d before first COW`, async () => {
    const { session, host, source } = await setup("feats");
    const visible = await RequirementsMethods.getEntityRequirements(host.id, "feats", source.id);
    const requirement = visible.find(r => r.target === "abilities.strength.total")!;
    expect(requirement).toBeDefined();
    if (action === "update") {
      await RequirementsMethods.updateEntityRequirement(session, host.id, "feats", source.id, requirement.id, { level: requirement.level, target: requirement.target!, operator: requirement.operator!, value: "15" });
    } else {
      await RequirementsMethods.deleteEntityRequirement(session, host.id, "feats", source.id, requirement.id);
    }
    const next = await withRulesetScope(db, host.id, async ({ rulesetData }) => rulesetData.requirementsByEntity.get(source.id) ?? []);
    expect(next.filter(r => r.target === "abilities.strength.total").map(r => r.value)).toEqual(action === "update" ? ["15"] : []);
  });
}

for (const action of ["update leaf", "delete leaf", "update chain"] as const) {
  test(`${action} preserves source identity through requirement renumbering`, async () => {
    const { host, copies } = await setup("feats", async (entityId, index) => {
      const owner = { entityId, entityType: "feats" };
      const strength = { target: "abilities.strength.total", operator: "greater_than_or_equal", value: "13", valueType: "number" };
      const dexterity = { ...strength, target: "abilities.dexterity.total", value: "10" };
      await Requirements.createMany(db, index === 0 ? [
        { ...owner, ...dexterity, level: "1" },
      ] : [
        { ...owner, level: "1", chainingOperator: "or" },
        { ...owner, ...strength, level: "1.1" },
        { ...owner, level: "1.2", chainingOperator: "and" },
        { ...owner, ...strength, level: "1.2.1" },
        { ...owner, ...dexterity, value: "15", level: "1.2.2" },
        { ...owner, ...dexterity, level: "1.3" },
      ]);
    });
    const originals = await Requirements.findManyByEntity(db, { entityIds: copies, entityType: "feats" });
    const visible = await RequirementsMethods.getEntityRequirements(host.id, "feats", copies[0]);
    expect(visible.map(r => r.level).sort()).toEqual(["1", "2", "2.1", "2.2", "2.2.1", "2.2.2", "2.3"]);
    const target = visible.find(r => r.level === (action === "update chain" ? "2" : "2.2.1"))!;
    const original = originals.find(r => r.id === target.id)!;
    expect(original.level).toBe(action === "update chain" ? "1" : "1.2.1");
    expect(target.updatedAt).toBe(original.updatedAt);

    const api = testClient(application);
    const route = api.api.rulesets[":id"].customization[":entityType"][":entityId"].requirements[":requirement_id"];
    const param = { id: host.id, entityType: "feats" as const, entityId: copies[0], requirement_id: target.id };
    const options = { headers: { cookie: "session-id=00000000-0000-4000-8000-000000000123" } };
    const response = action === "delete leaf"
      ? await route.$delete({ param }, options)
      : await route.$put({ param, json: action === "update chain"
        ? { level: target.level, chainingOperator: "and" }
        : { level: target.level, target: target.target!, operator: "greater_than_or_equal", value: "17" } }, options);
    expect(response.status).toBe(200);

    const shape = (rows: typeof visible) => rows.map(r => ({ level: r.level, target: r.target, value: r.value, chainingOperator: r.chainingOperator })).sort((a, b) => a.level.localeCompare(b.level));
    const expected = visible.filter(r => action !== "delete leaf" || r.id !== target.id).map(r => r.id !== target.id ? r
      : action === "update chain" ? { ...r, chainingOperator: "and" } : { ...r, value: "17" });
    for (const cold of [false, true]) {
      if (cold) invalidateAll();
      const after = await RequirementsMethods.getEntityRequirements(host.id, "feats", copies[0]);
      expect(shape(after)).toEqual(shape(expected));
      expect(after.some(r => originals.some(source => source.id === r.id))).toBe(false);
    }
    expect(await Requirements.findManyByEntity(db, { entityIds: copies, entityType: "feats" })).toEqual(originals);
    expect((await route.$delete({ param }, options)).status).toBe(404);
  });
}

test("hidden and unrelated template properties cannot be overridden", async () => {
  const { session, host, source, copies } = await setup("items", async (entityId) => {
    await Properties.create(db, { entityId, entityType: "items", type: "DUPLICATE", value: "1" });
  });
  const item = await ItemsMethods.duplicateRulesetItem(session, host.id, source.id, { name: "Template ownership check" });
  const [hidden] = await Properties.findManyByEntity(db, { entityIds: [copies[1]], entityType: "items" });
  const [unrelatedItem] = await Items.create(db, { rulesetId: host.id, name: "Unrelated template", isTemplate: true });
  const [unrelated] = await Properties.create(db, { entityId: unrelatedItem.id, entityType: "items", type: "OTHER", value: "2" });
  invalidateAll();
  const before = await ItemsMethods.getRulesetItem(host.id, item.id);
  expect(before.properties).toHaveLength(1);
  expect(before.properties[0].id).not.toBe(hidden.id);
  for (const property of [hidden, unrelated]) {
    await expect(PropertiesMethods.updateEntityProperty(session, host.id, "items", item.id, property.id, { type: property.type, value: "99" })).rejects.toBeInstanceOf(NotFoundError);
    expect(await Properties.findOne(db, { id: property.id })).toEqual(property);
  }
});

test("three-extension requirement merge preserves chains and rejects a duplicate standalone ID", async () => {
  const { session, host, source, copies } = await setup("feats", async (entityId, index) => {
    const owner = { entityId, entityType: "feats" };
    const leaf = { target: "abilities.strength.total", operator: "greater_than_or_equal", value: "13", valueType: "number" };
    if (index < 2) await Requirements.create(db, { ...owner, ...leaf, level: "1" });
    else await Requirements.createMany(db, [
      { ...owner, level: "1", chainingOperator: "or" },
      { ...owner, ...leaf, level: "1.1" },
      { ...owner, ...leaf, target: "abilities.dexterity.total", level: "1.2" },
    ]);
  }, 3);
  const [hidden] = await Requirements.findManyByEntity(db, { entityIds: [copies[1]], entityType: "feats" });
  const before = await RequirementsMethods.getEntityRequirements(host.id, "feats", source.id);
  expect(before.map(r => r.level).sort()).toEqual(["1", "2", "2.1", "2.2"]);
  await expect(RequirementsMethods.deleteEntityRequirement(session, host.id, "feats", source.id, hidden.id)).rejects.toBeInstanceOf(NotFoundError);
  const siblingLeaf = before.find(r => r.level === "2.2")!;
  await RequirementsMethods.updateEntityRequirement(session, host.id, "feats", source.id, siblingLeaf.id, { level: siblingLeaf.level, target: siblingLeaf.target!, operator: "greater_than_or_equal", value: "15" });
  const after = await RequirementsMethods.getEntityRequirements(host.id, "feats", source.id);
  expect(after.find(r => r.level === "2.2")?.value).toBe("15");
  expect(after.find(r => r.level === "1")?.value).toBe("13");
});

test("a sibling standalone and chain keep distinct levels on display and first copy", async () => {
  const { session, host, source } = await setup("feats", async (entityId, index) => {
    if (index === 0) return;
    const owner = { entityId, entityType: "feats" };
    const leaf = { target: "abilities.strength.total", operator: "greater_than_or_equal", value: "13", valueType: "number" };
    await Requirements.createMany(db, [
      { ...owner, ...leaf, level: "1" },
      { ...owner, level: "2", chainingOperator: "or" },
      { ...owner, ...leaf, target: "abilities.dexterity.total", level: "2.1" },
    ]);
  });
  const before = await RequirementsMethods.getEntityRequirements(host.id, "feats", source.id);
  expect(before.map(r => r.level).sort()).toEqual(["1", "2", "2.1"]);
  const target = before.find(r => r.level === "2.1")!;
  await RequirementsMethods.updateEntityRequirement(session, host.id, "feats", source.id, target.id, { level: target.level, target: target.target!, operator: "greater_than_or_equal", value: "15" });
  const after = await RequirementsMethods.getEntityRequirements(host.id, "feats", source.id);
  expect(after.map(r => r.level).sort()).toEqual(["1", "2", "2.1"]);
  expect(after.find(r => r.level === "2")?.chainingOperator).toBe("or");
  expect(after.find(r => r.level === "2.1")?.value).toBe("15");
});
