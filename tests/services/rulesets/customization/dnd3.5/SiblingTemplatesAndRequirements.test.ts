import { expect, test } from "bun:test";

import type { OwnerFields } from "@/engine/core/module/index.ts";
import type { EntityFieldValues, FieldValue } from "@/engine/index.ts";
import { ITEM_FIELDS } from "@/engine/rulesets/dnd3.5/entities/items/fields.ts";
import { type Feat, type Item } from "@/engine/rulesets/dnd3.5/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, Requirements, Rulesets } from "@/server/repositories/index.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { api, expectRefusedWith, expectStatus } from "@/tests/support/api.ts";
import { findFormValues, writeFieldValues } from "@/tests/support/ownerValues.ts";
import {
  copyEntity,
  createSeededTestRuleset,
  invalidateSeededRuleset,
  invalidateTestRulesets,
  ownerSessionOf,
} from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";
import {
  ITEM_IS_TEMPLATE,
  ITEM_TYPE,
  WEAPON_BASE_DAMAGE,
  WEAPON_CRITICAL_RANGE,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** What each extension's copy of the template holds of its own: a weapon field, its damage or its critical range. */
const TEMPLATE_FIELDS: [string, FieldValue][] = [
  [WEAPON_BASE_DAMAGE, "1d6"],
  [WEAPON_CRITICAL_RANGE, 2],
];

async function setup(
  entityType: "items" | "feats",
  configure?: (copyId: string, index: number) => Promise<void>,
  extensionCount = 2,
) {
  const session = makeSession();
  const host = await createSeededTestRuleset(session.userId);
  const source =
    entityType === "items"
      ? (
          await Entities.create<Item>(db, "items", {
            rulesetId: host.rulesetId!,
            name: "Audit Template",
            fields: { [ITEM_TYPE]: "Weapon", [ITEM_IS_TEMPLATE]: true },
          })
        )[0]
      : (await Entities.findOne<Feat>(db, {
          entityType: "feats",
          rulesetId: host.rulesetId!,
          name: "Toughness",
        }))!;
  if (entityType === "items") invalidateSeededRuleset(host.rulesetId!);
  const copies: string[] = [];
  const extensionIds: string[] = [];
  for (let i = 0; i < extensionCount; i++) {
    const extension = await createSeededTestRuleset(session.userId);
    const copy = await copyEntity(db, entityType, source.id, extension);
    copies.push(copy.id);
    extensionIds.push(extension.id);
    if (configure) {
      await configure(copy.id, i);
    } else if (entityType === "items") {
      await writeFieldValues(entityType, copy.id, [TEMPLATE_FIELDS[i]]);
    } else if (i === 1) {
      await Requirements.create(db, {
        entityId: copy.id,
        entityType,
        level: "1",
        target: "abilities.strength.total",
        operator: "greater_than_or_equal",
        value: "13",
        valueType: "number",
      });
    }
    await Rulesets.update(
      db,
      { kind: "extension", status: "Published", private: false, userId: null },
      { id: extension.id },
    );
  }
  await RulesetExtensionsService.subscribeExtension(session, host.id, extensionIds);
  return { session, host, source, copies, rulesetIds: [host.id, ...extensionIds] };
}

test.each([
  [0, { [WEAPON_BASE_DAMAGE]: "2d6" }, [WEAPON_BASE_DAMAGE, "2d6"]],
  [1, { [WEAPON_CRITICAL_RANGE]: 3 }, [WEAPON_CRITICAL_RANGE, 3]],
])("derived item can override template field from extension %i", async (_, override, row) => {
  const { session, host, source, copies } = await setup("items");
  const item = await EntitiesService.duplicateEntity(session, host.id, "items", source.id, {
    name: "Audit Derived Item",
    fields: { [ITEM_TYPE]: "Weapon" },
  });
  const copiesValues = () => Promise.all(copies.map((id) => findFormValues("items", id)));
  const templateValues = await copiesValues();
  // Its template's fields, each extension's copy's own, as the view merges them
  const read = await EntitiesService.getEntity(await ownerSessionOf(host.id), host.id, "items", item.id);
  expect(read.fields).toMatchObject({ [WEAPON_BASE_DAMAGE]: "1d6", [WEAPON_CRITICAL_RANGE]: 2 });
  // Its fields as its form holds them, off those it answers with a value
  const held = Object.fromEntries(Object.entries(read.fields).filter(([, value]) => value !== null));
  const form = ITEM_FIELDS.toForm(ITEM_FIELDS.read({ fields: held as OwnerFields, links: {} }));
  await EntitiesService.updateEntity(session, host.id, "items", item.id, {
    name: item.name,
    fields: { ...(form.fields as EntityFieldValues), ...override, [ITEM_TYPE]: "Weapon" },
  });
  expect(await copiesValues()).toEqual(templateValues);
  // The item stores only the field it overrides, and reads the other off its template
  const own = await findFormValues("items", item.id);
  expect(Object.entries(own.fields).flatMap(([field, values]) => values.map((value) => [field, value]))).toEqual([row]);
  expect(
    (await EntitiesService.getEntity(await ownerSessionOf(host.id), host.id, "items", item.id)).fields,
  ).toMatchObject({
    ...read.fields,
    [row[0] as string]: row[1],
  });
});

for (const action of ["update", "delete"] as const) {
  test(`visible sibling requirement can be ${action}d before first COW`, async () => {
    const { session, host, source } = await setup("feats");
    const visible = await RequirementsService.getRequirements(
      await ownerSessionOf(host.id),
      host.id,
      "feats",
      source.id,
    );
    const requirement = visible.find((r) => r.target === "abilities.strength.total")!;
    expect(requirement).toBeDefined();
    if (action === "update") {
      await RequirementsService.updateRequirement(session, host.id, "feats", source.id, requirement.id, {
        level: requirement.level,
        target: requirement.target!,
        operator: requirement.operator!,
        value: "15",
      });
    } else {
      await RequirementsService.deleteRequirement(session, host.id, "feats", source.id, requirement.id);
    }
    const next = await withRulesetScope(
      db,
      host.id,
      async ({ rulesetData }) => rulesetData.requirementsByEntity.get(source.id) ?? [],
    );
    expect(next.filter((r) => r.target === "abilities.strength.total").map((r) => r.value)).toEqual(
      action === "update" ? ["15"] : [],
    );
  });
}

for (const action of ["update leaf", "delete leaf", "update chain"] as const) {
  test(`${action} preserves source identity through requirement renumbering`, async () => {
    const { host, copies, rulesetIds } = await setup("feats", async (entityId, index) => {
      const owner = { entityId, entityType: "feats" };
      const strength = {
        target: "abilities.strength.total",
        operator: "greater_than_or_equal",
        value: "13",
        valueType: "number",
      };
      const dexterity = { ...strength, target: "abilities.dexterity.total", value: "10" };
      await Requirements.createMany(
        db,
        index === 0
          ? [{ ...owner, ...dexterity, level: "1" }]
          : [
              { ...owner, level: "1", chainingOperator: "or" },
              { ...owner, ...strength, level: "1.1" },
              { ...owner, level: "1.2", chainingOperator: "and" },
              { ...owner, ...strength, level: "1.2.1" },
              { ...owner, ...dexterity, value: "15", level: "1.2.2" },
              { ...owner, ...dexterity, level: "1.3" },
            ],
      );
    });
    const originals = await Requirements.findMany(db, { entityIds: copies, entityType: "feats" });
    const visible = await RequirementsService.getRequirements(
      await ownerSessionOf(host.id),
      host.id,
      "feats",
      copies[0],
    );
    expect(visible.map((r) => r.level).sort()).toEqual(["1", "2", "2.1", "2.2", "2.2.1", "2.2.2", "2.3"]);
    const target = visible.find((r) => r.level === (action === "update chain" ? "2" : "2.2.1"))!;
    const original = originals.find((r) => r.id === target.id)!;
    expect(original.level).toBe(action === "update chain" ? "1" : "1.2.1");
    expect(target.updatedAt).toBe(original.updatedAt);
    const route = api.api.rulesets[":id"].customization[":entityType"][":entityId"].requirements[":requirementId"];
    const param = { id: host.id, entityType: "feats" as const, entityId: copies[0], requirementId: target.id };
    const response =
      action === "delete leaf"
        ? await route.$delete({ param })
        : await route.$put({
            param,
            json:
              action === "update chain"
                ? { level: target.level, chainingOperator: "and" }
                : { level: target.level, target: target.target!, operator: "greater_than_or_equal", value: "17" },
          });
    expect(response.status).toBe(200);

    const shape = (rows: typeof visible) =>
      rows
        .map((r) => ({ level: r.level, target: r.target, value: r.value, chainingOperator: r.chainingOperator }))
        .sort((a, b) => a.level.localeCompare(b.level));
    const expected = visible
      .filter((r) => action !== "delete leaf" || r.id !== target.id)
      .map((r) =>
        r.id !== target.id ? r : action === "update chain" ? { ...r, chainingOperator: "and" } : { ...r, value: "17" },
      );
    for (const cold of [false, true]) {
      if (cold) invalidateTestRulesets(...rulesetIds);
      const after = await RequirementsService.getRequirements(
        await ownerSessionOf(host.id),
        host.id,
        "feats",
        copies[0],
      );
      expect(shape(after)).toEqual(shape(expected));
      expect(after.some((r) => originals.some((source) => source.id === r.id))).toBe(false);
    }
    expect(await Requirements.findMany(db, { entityIds: copies, entityType: "feats" })).toEqual(originals);
    await expectStatus(route.$delete({ param }), 404);
  });
}

test("three-extension requirement merge preserves chains and rejects a duplicate standalone ID", async () => {
  const { session, host, source, copies } = await setup(
    "feats",
    async (entityId, index) => {
      const owner = { entityId, entityType: "feats" };
      const leaf = {
        target: "abilities.strength.total",
        operator: "greater_than_or_equal",
        value: "13",
        valueType: "number",
      };
      if (index < 2) {
        await Requirements.create(db, { ...owner, ...leaf, level: "1" });
      } else {
        await Requirements.createMany(db, [
          { ...owner, level: "1", chainingOperator: "or" },
          { ...owner, ...leaf, level: "1.1" },
          { ...owner, ...leaf, target: "abilities.dexterity.total", level: "1.2" },
        ]);
      }
    },
    3,
  );
  const [hidden] = await Requirements.findMany(db, { entityIds: [copies[1]], entityType: "feats" });
  const before = await RequirementsService.getRequirements(await ownerSessionOf(host.id), host.id, "feats", source.id);
  expect(before.map((r) => r.level).sort()).toEqual(["1", "2", "2.1", "2.2"]);
  await expectRefusedWith(RequirementsService.deleteRequirement(session, host.id, "feats", source.id, hidden.id), 404);
  const siblingLeaf = before.find((r) => r.level === "2.2")!;
  await RequirementsService.updateRequirement(session, host.id, "feats", source.id, siblingLeaf.id, {
    level: siblingLeaf.level,
    target: siblingLeaf.target!,
    operator: "greater_than_or_equal",
    value: "15",
  });
  const after = await RequirementsService.getRequirements(await ownerSessionOf(host.id), host.id, "feats", source.id);
  expect(after.find((r) => r.level === "2.2")?.value).toBe("15");
  expect(after.find((r) => r.level === "1")?.value).toBe("13");
});

test("a sibling standalone and chain keep distinct levels on display and first copy", async () => {
  const { session, host, source } = await setup("feats", async (entityId, index) => {
    if (index === 0) return;
    const owner = { entityId, entityType: "feats" };
    const leaf = {
      target: "abilities.strength.total",
      operator: "greater_than_or_equal",
      value: "13",
      valueType: "number",
    };
    await Requirements.createMany(db, [
      { ...owner, ...leaf, level: "1" },
      { ...owner, level: "2", chainingOperator: "or" },
      { ...owner, ...leaf, target: "abilities.dexterity.total", level: "2.1" },
    ]);
  });
  const before = await RequirementsService.getRequirements(await ownerSessionOf(host.id), host.id, "feats", source.id);
  expect(before.map((r) => r.level).sort()).toEqual(["1", "2", "2.1"]);
  const target = before.find((r) => r.level === "2.1")!;
  await RequirementsService.updateRequirement(session, host.id, "feats", source.id, target.id, {
    level: target.level,
    target: target.target!,
    operator: "greater_than_or_equal",
    value: "15",
  });
  const after = await RequirementsService.getRequirements(await ownerSessionOf(host.id), host.id, "feats", source.id);
  expect(after.map((r) => r.level).sort()).toEqual(["1", "2", "2.1"]);
  expect(after.find((r) => r.level === "2")?.chainingOperator).toBe("or");
  expect(after.find((r) => r.level === "2.1")?.value).toBe("15");
});

test("a sibling's group goes past a row under a missing level, on display and first copy", async () => {
  const { session, host, source } = await setup("feats", async (entityId, index) => {
    const owner = { entityId, entityType: "feats" };
    const atLeast = (target: string, value: string) => ({
      target: `abilities.${target}.total`,
      operator: "greater_than_or_equal",
      value,
      valueType: "number",
    });
    await Requirements.createMany(
      db,
      index === 0
        ? [
            { ...owner, ...atLeast("strength", "13"), level: "1" },
            { ...owner, ...atLeast("dexterity", "13"), level: "2" },
          ]
        : [
            // A row under a missing level, as deleting its group leaves it
            { ...owner, ...atLeast("strength", "15"), level: "3.1" },
            { ...owner, level: "4", chainingOperator: "or" },
            { ...owner, ...atLeast("dexterity", "15"), level: "4.1" },
          ],
    );
  });
  const levelsOf = async () =>
    (await RequirementsService.getRequirements(await ownerSessionOf(host.id), host.id, "feats", source.id))
      .map((r) => r.level)
      .sort();
  expect(await levelsOf()).toEqual(["1", "2", "3.1", "4", "4.1"]);
  const before = await RequirementsService.getRequirements(await ownerSessionOf(host.id), host.id, "feats", source.id);
  const target = before.find((r) => r.level === "4.1")!;
  await RequirementsService.updateRequirement(session, host.id, "feats", source.id, target.id, {
    level: target.level,
    target: target.target!,
    operator: "greater_than_or_equal",
    value: "17",
  });
  expect(await levelsOf()).toEqual(["1", "2", "3.1", "4", "4.1"]);
});
