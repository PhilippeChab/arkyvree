import { describe, expect, test } from "bun:test";

import StorageEngine from "@/engine/api/StorageEngine.ts";
import type { StoredLink } from "@/engine/core/module/index.ts";

/** A stored link of a role (`role`, to an entity of `toType`), made at `createdAt`, its `ordinal`th. */
function storedLink(role: string, toType: string, toId: string, createdAt: string, ordinal: number): StoredLink {
  return {
    amount: null,
    createdAt,
    free: false,
    id: `${role}-${toId}`,
    ordinal,
    role,
    tier: null,
    toId,
    toType,
    updatedAt: createdAt,
    viaId: null,
  };
}

/** The value an item's weight is written as (rounded to its scale), from what its form gives. */
function writtenWeight(weight: number | string) {
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

  test("writes a number of 1e21 or more, which JavaScript writes in exponent form", () => {
    expect(writtenWeight(1e21)).toBe(1e21);
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

  test("declares a view's kinds, an owner before what it owns, and the links whose sibling copies' merge", () => {
    const storage = StorageEngine.shared();
    const schema = storage.viewSchema();
    expect(storage.viewSchema()).toBe(schema);
    const order = schema.kinds.map(({ type }) => type);
    for (const { owner, type } of schema.kinds) {
      if (!owner) continue;
      expect(owner.column).toBe(storage.ownerColumn(type));
      expect(order.indexOf(owner.type)).toBeLessThan(order.indexOf(type));
    }
    // A kind's visible ids are kept when an owned kind's rows read them alone
    const read = new Set(schema.kinds.flatMap(({ owner }) => (owner ? [owner.type] : [])));
    expect(schema.kinds.filter(({ tracked }) => tracked).map(({ type }) => type)).toEqual(
      order.filter((type) => read.has(type)),
    );
    expect(schema.unionLinks).toEqual(
      storage
        .registries()
        .linkRoles.filter((def) => !def.single && def.merge === "union")
        .map(({ fromType, role, toType }) => ({ fromType, role, toType })),
    );
    expect(schema.unionLinks.length).toBeGreaterThan(0);
  });

  test("reads the kinds a user customizes and the types whose entities hold fields into the view's kinds", () => {
    const storage = StorageEngine.shared();
    const { fieldDefs } = storage.registries();
    // A field owner's fields aren't its columns', and every customizable kind's are a kind's
    const columnFields = new Set(
      storage
        .registries()
        .entityTypes.flatMap(({ type }) =>
          Object.values(storage.kind(type).columns).flatMap((column) => ("field" in column ? [column.field] : [])),
        ),
    );
    for (const type of storage.fieldOwners())
      expect(fieldDefs.some((def) => def.ownerType === type && !columnFields.has(def.field))).toBe(true);
    for (const { customizable, fields, type } of storage.viewSchema().kinds) {
      expect(customizable).toBe(!!storage.kind(type).customizable);
      expect(fields).toBe(storage.fieldOwners().includes(type));
    }
  });

  test("reads an entity's links of the roles it holds many of, in their order, as a view holds them", () => {
    const storage = StorageEngine.shared();
    const { linkRoles } = storage.registries();
    const many = linkRoles.find((def) => !def.single)!;
    const single = linkRoles.find((def) => def.single && def.fromType === many.fromType);
    const links = [
      storedLink(many.role, many.toType, "b", "2026-01-01 00:00:01+00", 0),
      storedLink(many.role, many.toType, "c", "2026-01-01 00:00:00+00", 1),
      storedLink(many.role, many.toType, "a", "2026-01-01 00:00:00+00", 1),
      ...(single ? [storedLink(single.role, single.toType, "d", "2026-01-01 00:00:00+00", 0)] : []),
    ];
    const read = storage.viewLinksOf({ id: "e", links, type: many.fromType });
    expect(read.map(({ fromId, role, toId }) => [fromId, role, toId])).toEqual([
      ["e", many.role, "a"],
      ["e", many.role, "c"],
      ["e", many.role, "b"],
    ]);
    expect(storage.viewLinksOf({ id: "e", links, type: "none" })).toEqual([]);
  });

  test("names the roles an entity's page edits, and those whose links refuse their target's delete", () => {
    const storage = StorageEngine.shared();
    const { linkRoles } = storage.registries();
    for (const [role, { from, to }] of storage.editedLinks()) {
      expect(storage.kind(from).editedLinks).toBe(role);
      expect(storage.role(role, from, to).single).toBe(false);
    }
    for (const { toType } of linkRoles) {
      const refusing = linkRoles.filter((def) => def.toType === toType && def.onDelete === "refuse");
      for (const role of storage.refusingRoles(toType)) expect(refusing.some((def) => def.role === role)).toBe(true);
    }
  });
});
