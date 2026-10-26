import { describe, expect, test } from "bun:test";

import Modules from "@/engine/api/Modules.ts";
import StorageEngine from "@/engine/api/StorageEngine.ts";
import type {
  FieldValue,
  Merge,
  RulesetModule,
  StorageRegistries,
  StoredEntity,
  StoredFieldValue,
  StoredLink,
} from "@/engine/core/module/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

/** Every registered module, its registries' declarations changed by `change`. */
function modulesWith(change: (registries: StorageRegistries) => void): [BaseRules, RulesetModule][] {
  return Modules.all().map(([baseRules, module]) => {
    const registries = structuredClone(module.storage.registries);
    change(registries);
    return [baseRules, { ...module, storage: { ...module.storage, registries } }];
  });
}

/** A stored entity of a kind (`type`), holding these fields' values (`fields`) and links (`links`). */
function storedEntity(type: string, fields: StoredFieldValue[], links: StoredLink[]): StoredEntity {
  return {
    campaignId: null,
    createdAt: "2026-01-01 00:00:00+00",
    deletedAt: null,
    description: null,
    fields,
    id: "e",
    links,
    name: "E",
    ownerId: null,
    partition: "",
    position: null,
    rulesetId: "r",
    type,
    updatedAt: "2026-01-01 00:00:00+00",
  };
}

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

/** A stored value of a field, its first. */
function storedValue(field: string, value: FieldValue): StoredFieldValue {
  return { createdAt: "2026-01-01 00:00:00+00", field, ordinal: 0, updatedAt: "2026-01-01 00:00:00+00", value };
}

describe("A module's storage", () => {
  test("declares a view's kinds, an owner before what it owns, and the links whose sibling copies' merge", () => {
    const storage = StorageEngine.shared();
    const schema = storage.viewSchema();
    expect(storage.viewSchema()).toBe(schema);
    const order = schema.kinds.map(({ type }) => type);
    const { entityTypes } = storage.registries();
    expect(schema.kinds.some(({ ownerType }) => ownerType)).toBe(true);
    for (const { ownerType, type } of schema.kinds) {
      expect(ownerType ?? null).toBe(entityTypes.find((def) => def.type === type)!.ownerType);
      if (ownerType) expect(order.indexOf(ownerType)).toBeLessThan(order.indexOf(type));
    }
    // A kind's visible ids are kept when an owned kind's entities read them alone
    const read = new Set(schema.kinds.flatMap(({ ownerType }) => (ownerType ? [ownerType] : [])));
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
    // A field owner's fields aren't all its kind's own, and every customizable kind's are a kind's
    const own = new Set(
      storage.registries().entityTypes.flatMap(({ type }) => Object.keys(storage.kind(type).fields ?? {})),
    );
    expect(own.size).toBeGreaterThan(0);
    for (const type of storage.fieldOwners())
      expect(fieldDefs.some((def) => def.ownerType === type && !own.has(def.field))).toBe(true);
    for (const { customizable, fields, type } of storage.viewSchema().kinds) {
      expect(customizable).toBe(!!storage.kind(type).customizable);
      expect(fields).toBe(storage.fieldOwners().includes(type));
    }
  });

  test("reads an entity's record: its own fields' values and its single links, not its stored values", () => {
    const storage = StorageEngine.shared();
    const { entityTypes, fieldDefs, linkRoles } = storage.registries();
    const ownOf = (type: string) => storage.kind(type).fields ?? {};
    const { type } = entityTypes.find(
      (def) =>
        Object.keys(ownOf(def.type)).length > 0 &&
        fieldDefs.some((field) => field.ownerType === def.type && !(field.field in ownOf(def.type))),
    )!;
    const [ownField] = Object.keys(ownOf(type));
    const declared = fieldDefs.find((def) => def.ownerType === type && !(def.field in ownOf(type)))!;
    const single = linkRoles.find(
      (def) => def.fromType === type && def.single && storage.recordReads().roles.includes(def.role),
    );
    const many = linkRoles.find((def) => def.fromType === type && !def.single);
    const record = storage.recordOf(
      storedEntity(
        type,
        [storedValue(ownField, 2), storedValue(declared.field, "held")],
        [
          ...(single ? [storedLink(single.role, single.toType, "s", "2026-01-01 00:00:00+00", 0)] : []),
          ...(many ? [storedLink(many.role, many.toType, "m", "2026-01-01 00:00:00+00", 0)] : []),
        ],
      ),
    );
    expect(record).toMatchObject({ id: "e", name: "E", type, partition: "" });
    expect(record.fields).toEqual({ [ownField]: 2 });
    expect(record.links).toEqual(single ? { [single.role]: "s" } : {});
    expect(storage.recordReads().fields).toContain(ownField);
    expect(storage.recordReads().fields).not.toContain(declared.field);
  });

  test("writes a new entity with its kind's own fields' defaults and its partition", () => {
    const storage = StorageEngine.shared();
    const { entityTypes } = storage.registries();
    for (const { type } of entityTypes) {
      const kind = storage.kind(type);
      const { fields, partition } = storage.defaultsOf(type);
      expect(partition).toBe(kind.partition ?? "");
      expect(fields).toEqual(
        Object.fromEntries(
          Object.entries(kind.fields ?? {}).flatMap(([field, own]) =>
            own.default === undefined ? [] : [[field, own.default]],
          ),
        ),
      );
    }
    expect(entityTypes.some(({ type }) => Object.keys(storage.defaultsOf(type).fields).length > 0)).toBe(true);
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

  test("refuses a merge or an inheritance it can't read, as the registries' checks did", () => {
    expect(() => new StorageEngine(Modules.all())).not.toThrow();
    const unknownMerge = modulesWith((registries) => {
      registries.linkRoles[0].merge = "average" as Merge;
    });
    expect(() => new StorageEngine(unknownMerge)).toThrow("merges by average, no rule the engine has");
    const unionOfOne = modulesWith((registries) => {
      registries.fieldDefs.find((def) => !def.multiple)!.merge = "union";
    });
    expect(() => new StorageEngine(unionOfOne)).toThrow("holds one value: its sibling copies can't union it");
    const unionOfSingle = modulesWith((registries) => {
      registries.linkRoles.find((def) => def.single)!.merge = "union";
    });
    expect(() => new StorageEngine(unionOfSingle)).toThrow("is single: its sibling copies can't union it");
    const inherited = StorageEngine.shared()
      .registries()
      .fieldDefs.find((def) => def.inheritsVia !== null)!;
    const throughMany = modulesWith((registries) => {
      for (const role of registries.linkRoles) if (role.role === inherited.inheritsVia) role.single = false;
    });
    expect(() => new StorageEngine(throughMany)).toThrow(`is read off another through ${inherited.inheritsVia}`);
    const notAnEntity = modulesWith((registries) => {
      registries.fieldDefs.find((def) => def.ownerKind !== "entity")!.inheritsVia = inherited.inheritsVia;
    });
    expect(() => new StorageEngine(notAnEntity)).toThrow(`is read off another through ${inherited.inheritsVia}`);
  });
});
