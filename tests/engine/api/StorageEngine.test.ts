import { describe, expect, test } from "bun:test";

import Modules from "@/engine/api/Modules.ts";
import StorageEngine from "@/engine/api/StorageEngine.ts";
import { Field, type Fields, type StoredLeaf } from "@/engine/core/fields/index.ts";
import type {
  FieldValue,
  RulesetModule,
  StorageRegistries,
  StoredEntity,
  StoredFieldValue,
  StoredLink,
} from "@/engine/core/module/index.ts";
import { Engine } from "@/engine/index.ts";
import type { Merge } from "@/shared/customization/fields.ts";
import type { BaseRules } from "@/shared/enums.ts";

/** The first stored field of `fields` (each owner type's) that `find` picks, its declaration to change in place. */
function leafOf(fields: Record<string, Fields>, find: (leaf: StoredLeaf) => boolean): Record<string, unknown> {
  return Object.values(fields)
    .flatMap((owned) => Field.storedLeavesOf(owned))
    .find(find) as unknown as Record<string, unknown>;
}

/** Every registered module, its registries' and its fields' declarations changed by `change`. */
function modulesWith(
  change: (registries: StorageRegistries, fields: Record<string, Fields>) => void,
): [BaseRules, RulesetModule][] {
  return Modules.all().map(([baseRules, module]) => {
    const registries = structuredClone(module.storage.registries);
    const fields = structuredClone(module.fields) as Record<string, Fields>;
    change(registries, fields);
    return [baseRules, { ...module, fields, storage: { ...module.storage, registries } }];
  });
}

/** A stored entity of a kind (`type`), holding these fields' values (`fields`) and links (`links`). */
function storedEntity(type: string, fields: StoredFieldValue[], links: StoredLink[]): StoredEntity {
  return {
    campaignId: null,
    createdAt: "2026-01-01 00:00:00+00",
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

/** A stored value of a field, its `ordinal`th. */
function storedValue(field: string, value: FieldValue, ordinal = 0): StoredFieldValue {
  return { createdAt: "2026-01-01 00:00:00+00", field, ordinal, updatedAt: "2026-01-01 00:00:00+00", value };
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

  test("reads the kinds a user customizes into the view's kinds, and describes every stored field's owner", () => {
    const storage = StorageEngine.shared();
    const { fieldDefs } = storage.registries();
    // Every stored field of an entity or a ruleset is its owner's, as its module declares them, whose form the rules
    // describe (an owner may hold links alone: a save, its ability)
    const owners = Object.values(Engine.rules().describeAll()).flatMap(({ fields }) => Object.keys(fields));
    for (const def of fieldDefs.filter(({ ownerKind }) => ownerKind !== "character"))
      expect(owners).toContain(def.ownerType);
    for (const { customizable, type } of storage.viewSchema().kinds)
      expect(customizable).toBe(!!storage.kind(type).customizable);
  });

  test("reads an entity's record: every field it holds, in their declared order, and its single links", () => {
    const storage = StorageEngine.shared();
    const { fieldDefs, linkRoles } = storage.registries();
    const set = fieldDefs.find((def) => def.ownerKind === "entity" && def.multiple && def.valueKind === "text")!;
    const { ownerType: type } = set;
    const single = fieldDefs.find((def) => def.ownerType === type && !def.multiple)!;
    const singleRole = linkRoles.find((def) => def.fromType === type && def.single);
    const many = linkRoles.find((def) => def.fromType === type && !def.single);
    const record = storage.recordOf(
      storedEntity(
        type,
        [
          storedValue(set.field, "zz", 0),
          storedValue(set.field, "aa", 1),
          storedValue(single.field, single.valueKind === "number" ? 2 : single.valueKind === "flag" || "held"),
        ],
        [
          ...(singleRole ? [storedLink(singleRole.role, singleRole.toType, "s", "2026-01-01 00:00:00+00", 0)] : []),
          ...(many ? [storedLink(many.role, many.toType, "m", "2026-01-01 00:00:00+00", 0)] : []),
        ],
      ),
    );
    expect(record).toMatchObject({ id: "e", name: "E", type, partition: "" });
    const declared = storage.declaredFields();
    expect(record.fields).toEqual({
      [set.field]: declared.orderValues(set.field, ["zz", "aa"]),
      [single.field]: single.valueKind === "number" ? 2 : single.valueKind === "flag" || "held",
    });
    expect(Object.keys(record.fields)).toEqual(
      [set.field, single.field].toSorted((a, b) => declared.compareFields(a, b)),
    );
    expect(record.links).toEqual(singleRole ? { [singleRole.role]: "s" } : {});
  });

  test("stores a number field's value kept to its places, refusing one it doesn't hold exactly, a character's too", () => {
    const storage = StorageEngine.shared();
    const { fieldDefs } = storage.registries();
    const scaled = fieldDefs.find(
      (def) => def.valueKind === "number" && storage.declaredFields().scaleOf(def.ownerType, def.field) === 2,
    )!;
    const whole = fieldDefs.find((def) => def.ownerType === "characters" && def.valueKind === "number")!;
    expect(storage.storedNumber(scaled.ownerType, scaled.field, 1.005)).toBe("1.01");
    expect(storage.storedNumber(scaled.ownerType, scaled.field, 90_071_992_547_409.9)).toBe("90071992547409.9");
    expect(storage.storedNumber(whole.ownerType, whole.field, Number.MAX_SAFE_INTEGER)).toBe("9007199254740991");
    for (const value of [Number("12345678901234567.89"), 1e21, 1e300, Number.NaN]) {
      expect(() => storage.storedNumber(scaled.ownerType, scaled.field, value)).toThrow(
        "holds a number it keeps exactly",
      );
    }
    for (const value of [Number.MAX_SAFE_INTEGER + 2, -1e300]) {
      expect(() => storage.storedNumber(whole.ownerType, whole.field, value)).toThrow(
        "holds a number it keeps exactly",
      );
    }
  });

  test("reads kind-wide only the fields declared so, of a kind that declares any", () => {
    const storage = StorageEngine.shared();
    const declared = storage.declaredFields();
    const { fieldDefs } = storage.registries();
    const owner = fieldDefs.find(
      (def) => def.ownerKind === "entity" && declared.kindWideFields(def.ownerType).size > 0,
    )!.ownerType;
    const [wide] = declared.kindWideFields(owner);
    const own = fieldDefs.find(
      (def) => def.ownerType === owner && !def.multiple && !declared.kindWideFields(owner).has(def.field),
    )!;
    const none = fieldDefs.find(
      (def) => def.ownerKind === "entity" && declared.kindWideFields(def.ownerType).size === 0,
    )!;
    const value = (def: { valueKind: string }) => (def.valueKind === "number" ? 1 : def.valueKind === "flag" || "x");
    const wideDef = fieldDefs.find((def) => def.ownerType === owner && def.field === wide)!;
    const values = storage.kindValues([
      { ...storedEntity(owner, [storedValue(wide, value(wideDef)), storedValue(own.field, value(own))], []), id: "a" },
      { ...storedEntity(none.ownerType, [storedValue(none.field, value(none))], []), id: "b" },
    ]);
    expect([...values.keys()]).toEqual([owner]);
    expect(values.get(owner)).toEqual([{ entityIds: ["a"], field: wide, value: String(value(wideDef)) }]);
  });

  test("writes a new entity with its fields always written's defaults and its partition", () => {
    const storage = StorageEngine.shared();
    const { entityTypes } = storage.registries();
    for (const { type } of entityTypes) {
      const { fields, partition } = storage.defaultsOf(type);
      expect(partition).toBe(storage.kind(type).partition ?? "");
      expect(fields).toEqual(storage.declaredFields().writtenDefaults(type));
    }
    expect(entityTypes.some(({ type }) => Object.keys(storage.defaultsOf(type).fields).length > 0)).toBe(true);
  });

  test("reads an entity's links as a view holds them: in the order they were made, then by ordinal and target", () => {
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
    const read = storage.viewLinksOf({ id: "e", links });
    expect(read.map(({ fromId, role, toId }) => [fromId, role, toId])).toEqual([
      ...(single ? [["e", single.role, "d"]] : []),
      ["e", many.role, "a"],
      ["e", many.role, "c"],
      ["e", many.role, "b"],
    ]);
  });

  test("answers a player character's kind, the kinds a user customizes and those a name is the identity of", () => {
    const storage = StorageEngine.shared();
    const types = storage.registries().entityTypes.map(({ type }) => type);
    expect(storage.playerKinds().length).toBeGreaterThan(0);
    for (const kind of storage.playerKinds()) {
      expect(storage.isPlayerKind(kind)).toBe(true);
      expect(storage.isPlayerKind(`${kind}-child`)).toBe(false);
    }
    // By type, as a refusal of another kind lists them
    expect(storage.customizableKinds()).toEqual(
      types.filter((type) => storage.kind(type).customizable).toSorted((a, b) => a.localeCompare(b)),
    );
    expect(storage.customizableKinds()).toBe(storage.customizableKinds());
    for (const type of types) expect(storage.isIdentityKind(type)).toBe(storage.kind(type).namesakes === "identity");
    expect(types.some((type) => storage.isIdentityKind(type))).toBe(true);
  });

  test("answers the kinds whose customizations have a page of their own, as the rules describe them", () => {
    const storage = StorageEngine.shared();
    const pages = storage.customizationPages();
    expect(pages).toBe(storage.customizationPages());
    // A customizable kind's, but one that owns another's, whose customizations are its page's tabs; an owned kind's names
    // its owner
    for (const type of storage.registries().entityTypes.map((def) => def.type)) {
      const customized = storage.customizableKinds().includes(type) && !storage.ownerKinds().includes(type);
      expect({ type, page: pages.get(type) }).toEqual({
        type,
        page: customized ? { type, ...(storage.ownerOf(type) && { owner: storage.ownerOf(type) }) } : undefined,
      });
    }
    // Every base rules' rules describe the same pages, a kind being one module's
    const described = Object.values(Engine.rules().describeAll()).flatMap((rules) => rules.customizationPages);
    expect(described).toEqual([...pages.values()]);
  });

  test("answers each owned kind's owner, and the kinds no other owns, in their declarations' order", () => {
    const storage = StorageEngine.shared();
    const { entityTypes } = storage.registries();
    for (const { ownerType, type } of entityTypes) expect(storage.ownerOf(type)).toBe(ownerType ?? undefined);
    expect(storage.standaloneKinds() as readonly string[]).toEqual(
      entityTypes.filter((def) => !def.ownerType).map(({ type }) => type),
    );
    expect(storage.standaloneKinds()).toBe(storage.standaloneKinds());
    for (const type of storage.ownedTypes()) expect(storage.ownedKinds(storage.ownerOf(type)!)).toContain(type);
    expect(storage.ownedTypes().length).toBeGreaterThan(0);
  });

  test("names the roles an entity's page edits, and those whose links refuse their target's delete", () => {
    const storage = StorageEngine.shared();
    const { linkRoles } = storage.registries();
    expect(storage.editedLinks()).toBe(storage.editedLinks());
    for (const [role, { from, to }] of storage.editedLinks()) {
      expect(storage.kind(from).editedLinks).toBe(role);
      expect(storage.role(role, from, to).single).toBe(false);
    }
    for (const { toType } of linkRoles) {
      const refusing = linkRoles.filter((def) => def.toType === toType && def.onDelete === "refuse");
      for (const role of storage.refusingRoles(toType)) expect(refusing.some((def) => def.role === role)).toBe(true);
    }
  });

  test("refuses a merge or an inheritance it can't read", () => {
    expect(() => new StorageEngine(Modules.all())).not.toThrow();
    const unknownMerge = modulesWith((registries) => {
      registries.linkRoles[0].merge = "average" as Merge;
    });
    expect(() => new StorageEngine(unknownMerge)).toThrow("merges by average, no rule the engine has");
    const unionOfOne = modulesWith((_, fields) => {
      leafOf(fields, (leaf) => !Field.storedKindOf(leaf).multiple).merge = "union";
    });
    expect(() => new StorageEngine(unionOfOne)).toThrow("holds one value: its sibling copies can't union it");
    const unionOfSingle = modulesWith((registries) => {
      registries.linkRoles.find((def) => def.single)!.merge = "union";
    });
    expect(() => new StorageEngine(unionOfSingle)).toThrow("holds one value: its sibling copies can't union it");
    const inherits = Object.values(Modules.all()[0][1].fields)
      .flatMap((owned) => Field.storedLeavesOf(owned))
      .find((leaf) => leaf.inherits)!.inherits!;
    const throughMany = modulesWith((registries) => {
      for (const role of registries.linkRoles) if (role.role === inherits) role.single = false;
    });
    expect(() => new StorageEngine(throughMany)).toThrow(`is read off another through ${inherits}`);
    const notAnEntity = modulesWith((_, fields) => {
      leafOf({ rulesets: fields.rulesets! }, () => true).inherits = inherits;
    });
    expect(() => new StorageEngine(notAnEntity)).toThrow(`is read off another through ${inherits}`);
  });
});
