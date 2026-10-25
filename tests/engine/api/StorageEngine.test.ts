import { describe, expect, test } from "bun:test";

import StorageEngine from "@/engine/api/StorageEngine.ts";

/** The value an item's weight is written as (rounded to its scale), from what its form gives. */
function writtenWeight(weight: string) {
  const write = StorageEngine.shared().writeOf("items", { name: "Pebble", rulesetId: "r", weight }, true);
  return write.fields.find((field) => field.field === "ITEM_WEIGHT")?.value;
}

describe("A kind's write", () => {
  test("rounds a decimal to its scale, half away from zero, as Postgres's round does", () => {
    expect(writtenWeight("1.005")).toBe(1.01);
    expect(writtenWeight("0.000001")).toBe(0);
    expect(writtenWeight("-2.345")).toBe(-2.35);
  });

  test("reads a decimal JavaScript writes in exponent form (below 1e-6)", () => {
    expect(writtenWeight(String(0.0000001))).toBe(0);
    expect(writtenWeight("1.5e2")).toBe(150);
  });
});

describe("A module's storage", () => {
  test("names the column an owned kind keeps its owner in, refusing a kind no module stores as owned", () => {
    const storage = StorageEngine.shared();
    const { entityTypes } = storage.registries();
    const owned = entityTypes.filter((def) => def.ownerType !== null);
    expect(owned.length).toBeGreaterThan(0);
    for (const { type } of owned) expect(storage.kind(type).columns[storage.ownerColumn(type)].kind).toBe("owner");
    const unowned = entityTypes.find((def) => def.ownerType === null)!;
    expect(() => storage.ownerColumn(unowned.type)).toThrow(`No module stores ${unowned.type} as owned`);
  });

  test("declares a view's kinds, an owner before what it owns, and the joins its kinds' lists don't nest", () => {
    const storage = StorageEngine.shared();
    const schema = storage.viewSchema();
    expect(storage.viewSchema()).toBe(schema);
    const order = schema.kinds.map(({ type }) => type);
    for (const { lists, owner, type } of schema.kinds) {
      if (owner) {
        expect(owner.column).toBe(storage.ownerColumn(type));
        expect(order.indexOf(owner.type)).toBeLessThan(order.indexOf(type));
      }
      for (const list of lists) {
        const join = storage.join(
          Object.values(storage.kind(type).lists ?? {}).find((l) => l.target === list.target)!.join,
        );
        expect([join.columns[list.from], join.columns[list.to], join.to]).toEqual(["from", "to", list.toType]);
      }
    }
    const listed = new Set(
      schema.kinds.flatMap(({ type }) => Object.values(storage.kind(type).lists ?? {}).map((l) => l.join)),
    );
    expect(schema.joins.map(({ name }) => name)).toEqual(storage.joinNames().filter((name) => !listed.has(name)));
    for (const join of schema.joins) expect(join.fromColumn).toBe(storage.joinFromColumn(join.name));
    // A kind's visible ids are kept when an owned kind's rows or a join's read them alone
    const read = new Set([
      ...schema.kinds.flatMap(({ owner }) => (owner ? [owner.type] : [])),
      ...schema.joins.map(({ from }) => from),
    ]);
    expect(schema.kinds.filter(({ tracked }) => tracked).map(({ type }) => type)).toEqual(
      order.filter((type) => read.has(type)),
    );
  });

  test("reads the kinds a user customizes and the types whose properties hold fields into the view's kinds", () => {
    const storage = StorageEngine.shared();
    const { fieldDefs } = storage.registries();
    // A property type's fields aren't its columns', and every customizable kind's are a kind's
    const columnFields = new Set(
      storage
        .registries()
        .entityTypes.flatMap(({ type }) =>
          Object.values(storage.kind(type).columns).flatMap((column) => ("field" in column ? [column.field] : [])),
        ),
    );
    for (const type of storage.propertyTypes())
      expect(fieldDefs.some((def) => def.ownerType === type && !columnFields.has(def.field))).toBe(true);
    for (const { customizable, properties, type } of storage.viewSchema().kinds) {
      expect(customizable).toBe(!!storage.kind(type).customizable);
      expect(properties).toBe(storage.propertyTypes().includes(type));
    }
  });

  test("names the column each join keeps its from-entity in", () => {
    const storage = StorageEngine.shared();
    for (const join of storage.joinNames())
      expect(storage.join(join).columns[storage.joinFromColumn(join)]).toBe("from");
  });
});
