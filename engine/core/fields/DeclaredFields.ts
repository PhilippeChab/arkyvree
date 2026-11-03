import type { FieldValue, LinkRoleDef, OwnerFields } from "@/engine/core/module/index.ts";
import type { Merge } from "@/shared/customization/fields.ts";

import Field, { type Fields, type StoredLeaf } from "./Field.ts";
import FieldCodec from "./FieldCodec.ts";

/** A row of an owner's field: its value, and its place among the field's (a single field's 0). */
interface FieldRow {
  field: string;
  ordinal: number;
  value: FieldValue;
}

/**
 * The fields every module declares, by their owner's type (an entity type, `rulesets`), each declared once
 * (`RulesetModule.fields`), as a view keeps and merges their values: their order, as a stat block shows them
 * (`compareFields`: the order they're declared in, one none declares after them, by name), each set's values'
 * (`orderValues`: its closed list's, then by text), an owner's fields as a view holds them (`fieldsOf`), how sibling
 * copies merge each field and single link (`mergeOf`, `roleMergeOf`), those an owner reads off another when it holds
 * none (`inheritance`: an item's, off its template), and the places a number is kept to (`scaleOf`).
 */
export default class DeclaredFields {
  /** `fields`: each owner type's, as its module declares them; `linkRoles`: the link roles, each with its merge. */
  constructor(fields: Readonly<Record<string, Fields>>, linkRoles: readonly LinkRoleDef[]) {
    const stored = Object.values(fields).flatMap((owned) => Field.storedLeavesOf(owned));
    this.ranks = new Map(stored.map((leaf, rank) => [leaf.field, rank]));
    this.valueRanks = new Map(
      stored.flatMap((leaf) => {
        const values = Field.closedValuesOf(leaf);
        return values ? [[leaf.field, new Map(values.map((value, rank) => [value, rank]))]] : [];
      }),
    );
    this.leaves = new Map(
      Object.entries(fields).flatMap(([ownerType, owned]) =>
        Field.storedLeavesOf(owned).map((leaf): [string, StoredLeaf] => [`${ownerType}:${leaf.field}`, leaf]),
      ),
    );
    this.layouts = new Map(
      Object.entries(fields).map(([ownerType, owned]) => [
        ownerType,
        new Map(
          Field.storedLeavesOf(owned).map((leaf) => [
            leaf.field,
            { rank: this.rankOf(leaf.field), set: Field.storedKindOf(leaf).multiple },
          ]),
        ),
      ]),
    );
    this.roleMerges = new Map(linkRoles.map((def) => [`${def.fromType}:${def.role}`, def.merge]));
    this.kindWide = new Map(
      Object.entries(fields).map(([ownerType, owned]) => [
        ownerType,
        new Set(Field.storedLeavesOf(owned).flatMap((leaf) => (leaf.kindWide ? [leaf.field] : []))),
      ]),
    );
    this.inheritances = new Map();
    for (const [ownerType, owned] of Object.entries(fields)) {
      for (const leaf of Field.storedLeavesOf(owned)) {
        if (!leaf.inherits) continue;
        const inheritance = this.inheritances.get(ownerType) ?? { fields: new Set<string>(), role: leaf.inherits };
        if (inheritance.role !== leaf.inherits)
          throw new Error(`${ownerType} reads its fields off others through ${inheritance.role} and ${leaf.inherits}`);
        inheritance.fields.add(leaf.field);
        this.inheritances.set(ownerType, inheritance);
      }
    }
  }

  /** The fields each owner type reads off another when it has none, and the role of the link to it, by owner type. */
  private readonly inheritances: Map<string, { fields: Set<string>; role: string }>;

  /** Each owner type's fields read kind-wide (`StoredLeafBase.kindWide`), by owner type. */
  private readonly kindWide: ReadonlyMap<string, ReadonlySet<string>>;

  /**
   * Each owner type's fields' places and whether each is a set, by field, read once: what an owner's fields are held by
   * (`fieldsOf`).
   */
  private readonly layouts: ReadonlyMap<string, ReadonlyMap<string, { rank: number; set: boolean }>>;

  /** Each owner type's fields' declarations, by `<owner type>:<field>`. */
  private readonly leaves: ReadonlyMap<string, StoredLeaf>;

  /** Each field's place, as its module declares them. */
  private readonly ranks: ReadonlyMap<string, number>;

  /** How sibling copies merge each link role, by `<owner type>:<role>`. */
  private readonly roleMerges: ReadonlyMap<string, Merge>;

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

  /**
   * What an owner type's single field reads where its owner holds no row of it (`FieldCodec.defaultOf`: its default, a
   * flag's false), which a filter on that value matches it by: none for a set, one without a default, or one none
   * declares.
   */
  absentValueOf(ownerType: string, field: string): FieldValue | null {
    const leaf = this.leaves.get(`${ownerType}:${field}`);
    if (!leaf || Field.storedKindOf(leaf).multiple) return null;
    const value = FieldCodec.defaultOf(leaf);
    return typeof value === "boolean" || typeof value === "number" || typeof value === "string" ? value : null;
  }

  /** How two fields sort, as a stat block shows them: by their declared places, then by name. */
  compareFields(a: string, b: string): number {
    return this.rankOf(a) - this.rankOf(b) || a.localeCompare(b);
  }

  /** How two values of a field sort, as text: by their places in its closed list, then by text. */
  compareValues(field: string, a: string, b: string): number {
    return this.valueRankOf(field, a) - this.valueRankOf(field, b) || a.localeCompare(b);
  }

  /**
   * An owner's fields as a view holds them (of `ownerType`, off its rows: `rows`, each a field's value and its place
   * among them, `ordinal`): a single field's value (its first row's), a set's values in its declared order
   * (`orderValues`), the fields in theirs (`compareFields`), each read off its type's layout, read once.
   */
  fieldsOf(ownerType: string, rows: readonly FieldRow[]): OwnerFields {
    const layout = this.layouts.get(ownerType);
    const byField = new Map<string, FieldRow[]>();
    for (const row of rows) {
      const held = byField.get(row.field);
      if (held) held.push(row);
      else byField.set(row.field, [row]);
    }
    const fields = [...byField.keys()];
    if (fields.length > 1) {
      const rank = (field: string) => layout?.get(field)?.rank ?? this.rankOf(field);
      fields.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    }
    const held: Record<string, FieldValue | FieldValue[]> = {};
    for (const field of fields) {
      const fieldRows = byField.get(field)!;
      const set = layout?.get(field)?.set ?? fieldRows.length > 1;
      if (fieldRows.length === 1) {
        held[field] = set ? [fieldRows[0].value] : fieldRows[0].value;
        continue;
      }
      const values = fieldRows.toSorted((a, b) => a.ordinal - b.ordinal).map(({ value }) => value);
      held[field] = set ? this.orderValues(field, values) : values[0];
    }
    return held;
  }

  /**
   * The fields an owner type reads off another when it holds none of them (an item's, off its template), and the role
   * of its link to it: none for a type that reads none.
   */
  inheritance(ownerType: string): { fields: ReadonlySet<string>; role: string } | undefined {
    return this.inheritances.get(ownerType);
  }

  /**
   * The fields of an owner type whose values are read kind-wide (`StoredLeafBase.kindWide`: a weapon's type, a feat's
   * family): none for a type that declares none.
   */
  kindWideFields(ownerType: string): ReadonlySet<string> {
    return this.kindWide.get(ownerType) ?? new Set();
  }

  /** How sibling copies merge an owner type's field: its declaration's, the winner's alone for one none declares. */
  mergeOf(ownerType: string, field: string): Merge {
    return this.leaves.get(`${ownerType}:${field}`)?.merge ?? "winner";
  }

  /** A set's values in its field's declared order: its closed list's, then by text. */
  orderValues(field: string, values: readonly FieldValue[]): FieldValue[] {
    return values.toSorted((a, b) => this.compareValues(field, String(a), String(b)));
  }

  /** How sibling copies merge an owner type's single link of a role: its role's, the winner's alone without one. */
  roleMergeOf(ownerType: string, role: string): Merge {
    return this.roleMerges.get(`${ownerType}:${role}`) ?? "winner";
  }

  /** The places an owner type's number field is kept to (an item's cost, two): none for a whole number, or any other. */
  scaleOf(ownerType: string, field: string): number | undefined {
    const leaf = this.leaves.get(`${ownerType}:${field}`);
    return leaf?.kind === "number" ? leaf.scale : undefined;
  }
}
