import type { FieldDef, FieldValue, LinkRoleDef, Merge } from "@/engine/core/module/index.ts";

import Field, { type Fields } from "./Field.ts";

/**
 * The fields every module declares, by their owner's type (an entity type, `rulesets`), as a view keeps their values:
 * their order, as a stat block shows them (`compareFields`: the order they're declared in, one none declares after them,
 * by name), each set's values' (`orderValues`: its closed list's, then by text), the roles of the links a kind's fields
 * read (`fieldRoles`), how sibling copies merge each (`mergeOf`, `roleMergeOf`), and those an owner reads off another
 * when it has none (`inheritance`: an item's, off its template).
 */
export default class DeclaredFields {
  /** `fields`: each owner type's, as its module declares them; `registries`: the field definitions and link roles. */
  constructor(
    fields: Readonly<Record<string, Fields>>,
    registries: { fieldDefs: readonly FieldDef[]; linkRoles: readonly LinkRoleDef[] },
  ) {
    const leaves = Object.values(fields).flatMap((owned) => Field.leavesOf(owned));
    this.ranks = new Map(leaves.map((leaf, rank) => [leaf.field, rank]));
    this.valueRanks = new Map(
      leaves.flatMap((leaf) => {
        const values = Field.closedValuesOf(leaf);
        return values ? [[leaf.field, new Map(values.map((value, rank) => [value, rank]))]] : [];
      }),
    );
    this.roles = new Map(
      Object.entries(fields).map(([ownerType, owned]) => [
        ownerType,
        Field.leavesOf(owned).flatMap((leaf) => (leaf.kind === "ref" ? [leaf.role] : [])),
      ]),
    );
    this.merges = new Map(registries.fieldDefs.map((def) => [`${def.ownerType}:${def.field}`, def.merge]));
    this.roleMerges = new Map(registries.linkRoles.map((def) => [`${def.fromType}:${def.role}`, def.merge]));
    this.inheritances = new Map();
    for (const def of registries.fieldDefs) {
      if (!def.inheritsVia) continue;
      const inheritance = this.inheritances.get(def.ownerType) ?? { fields: new Set<string>(), role: def.inheritsVia };
      inheritance.fields.add(def.field);
      this.inheritances.set(def.ownerType, inheritance);
    }
  }

  /** The fields each owner type reads off another when it has none, and the role of the link to it, by owner type. */
  private readonly inheritances: Map<string, { fields: Set<string>; role: string }>;

  /** How sibling copies merge each field, by `<owner type>:<field>`. */
  private readonly merges: ReadonlyMap<string, Merge>;

  /** Each field's place, as its module declares them. */
  private readonly ranks: ReadonlyMap<string, number>;

  /** How sibling copies merge each link role, by `<owner type>:<role>`. */
  private readonly roleMerges: ReadonlyMap<string, Merge>;

  /** The roles of the links each owner type's fields read, by owner type. */
  private readonly roles: ReadonlyMap<string, readonly string[]>;

  /** Each closed list's values' places, by field. */
  private readonly valueRanks: ReadonlyMap<string, ReadonlyMap<string, number>>;

  /** A field's place: its declared one, after all of them when none declares it. */
  private rankOf(field: string) {
    return this.ranks.get(field) ?? this.ranks.size;
  }

  /** A value's place among its field's closed values (`text`, the value's): after all of them when it isn't one. */
  private valueRankOf(field: string, text: string) {
    const ranks = this.valueRanks.get(field);
    return ranks?.get(text) ?? ranks?.size ?? 0;
  }

  /** How two fields sort, as a stat block shows them: by their declared places, then by name. */
  compareFields(a: string, b: string): number {
    return this.rankOf(a) - this.rankOf(b) || a.localeCompare(b);
  }

  /** How two values of a field sort, as text: by their places in its closed list, then by text. */
  compareValues(field: string, a: string, b: string): number {
    return this.valueRankOf(field, a) - this.valueRankOf(field, b) || a.localeCompare(b);
  }

  /** The roles of the links an owner type's fields read (a class's bonus spell ability's), none for one without. */
  fieldRoles(ownerType: string): readonly string[] {
    return this.roles.get(ownerType) ?? [];
  }

  /**
   * The fields an owner type reads off another when it holds none of them (an item's, off its template), and the role
   * of its link to it: none for a type that reads none.
   */
  inheritance(ownerType: string): { fields: ReadonlySet<string>; role: string } | undefined {
    return this.inheritances.get(ownerType);
  }

  /** How sibling copies merge an owner type's field: its definition's, a set's union for one none defines. */
  mergeOf(ownerType: string, field: string): Merge {
    return this.merges.get(`${ownerType}:${field}`) ?? "union";
  }

  /** A set's values in its field's declared order: its closed list's, then by text. */
  orderValues(field: string, values: readonly FieldValue[]): FieldValue[] {
    return values.toSorted((a, b) => this.compareValues(field, String(a), String(b)));
  }

  /** How sibling copies merge an owner type's link a field reads: its role's, a single link's fallback without one. */
  roleMergeOf(ownerType: string, role: string): Merge {
    return this.roleMerges.get(`${ownerType}:${role}`) ?? "fallback";
  }
}
