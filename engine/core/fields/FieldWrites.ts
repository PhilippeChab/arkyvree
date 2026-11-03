import type { FieldValue, FieldWrite } from "@/engine/core/module/index.ts";
import { isOneOf } from "@/shared/isOneOf.ts";

import Field, { type Fields, type StoredLeaf } from "./Field.ts";
import FieldCodec from "./FieldCodec.ts";

/** A leaf that counts only while another of its level holds one of `values` (its `when`, on a field). */
interface Condition {
  leaf: StoredLeaf;
  on: StoredLeaf;
  values: readonly (boolean | string)[];
}

/**
 * An owner type's rules for a write past each leaf's own: the leaves that count on another's value, the leaves always
 * written with the value they hold without one (`defaults`), the stored fields its form shows among its others, below
 * its name (`Field.isKept`), and the leaves without a value of which it keeps none of them (`keepsForm`: a spell's
 * school).
 */
interface OwnerRules {
  conditions: Condition[];
  defaults: [leaf: StoredLeaf, value: FieldValue][];
  keepers: StoredLeaf[];
  keptFields: ReadonlySet<string>;
}

/**
 * What a write of an owner's fields stores, whoever writes it (a seed, a form's save through its codec, an import), by
 * the fields every module declares (`RulesetModule.fields`, `characterFields`), so the same values store the same rows:
 * each value as its leaf stores it (`Field.writtenValues`), one always written that holds no value its default (a new
 * owner's it leaves out, or one it clears: an item's slot, a feat's selectable flag, a character's alignment), one
 * whose condition doesn't hold as its default would (a skill's armor check multiplier, while armor weighs on it), and
 * none of those its form shows when it holds no value of one that keeps them (`keepsForm`). It alone applies a
 * condition (a group's to each of its fields) and a keeper to a write, a codec writing the values it's given
 * (`FieldCodec.write`); what it can't apply, which a write of fields can't reach, it refuses as it's declared: a
 * condition on a reference or a list of links, or on another field that's no stored field of its level, and a link
 * among the fields a keeper keeps.
 */
export default class FieldWrites {
  /** `fields`: each owner type's, as its module declares them. */
  constructor(fields: Readonly<Record<string, Fields>>) {
    this.leaves = new Map(
      Object.entries(fields).flatMap(([ownerType, owned]) =>
        Field.storedLeavesOf(owned).map((leaf): [string, StoredLeaf] => [`${ownerType}:${leaf.field}`, leaf]),
      ),
    );
    this.rules = new Map(
      Object.entries(fields).map(([ownerType, owned]) => [ownerType, FieldWrites.rulesOf(ownerType, owned)]),
    );
  }

  /**
   * The leaves of a level (`fields`, of `ownerType`, a group's too) that count on another of their level's value, a
   * group's condition carried to each of its leaves. A condition no write applies is refused: one on a reference or a
   * list of links (or a group holding one), whose values are links, or one on another field that's no stored field of
   * its level (none, a group, a link).
   */
  private static conditionsOf(ownerType: string, fields: Fields): Condition[] {
    return Object.entries(fields).flatMap(([key, field]): Condition[] => {
      const inner = field.kind === "group" ? FieldWrites.conditionsOf(ownerType, field.fields) : [];
      if (!field.when) return inner;
      const on = fields[field.when.field];
      if (!on || on.kind === "group" || Field.isLinked(on))
        throw new Error(`${ownerType}'s ${key} counts on ${field.when.field}, no stored field of its level`);
      const leaves = field.kind === "group" ? Field.leavesOf(field.fields) : [field];
      const stored = leaves.flatMap((leaf) => (Field.isLinked(leaf) ? [] : [leaf]));
      if (stored.length < leaves.length)
        throw new Error(`${ownerType}'s ${key} counts on ${field.when.field}, which no write applies to a link`);
      const { values } = field.when;
      return [...inner, ...stored.map((leaf) => ({ leaf, on, values }))];
    });
  }

  /**
   * The leaves of an owner type's fields (`owned`) always written (`write: "always"`), each with the value one holds
   * without a value: its default (a flag's false without one).
   */
  private static defaultsOf(owned: Fields): [StoredLeaf, FieldValue][] {
    return Field.storedLeavesOf(owned).flatMap((leaf): [StoredLeaf, FieldValue][] => {
      if (!("write" in leaf) || leaf.write !== "always") return [];
      const value = leaf.kind === "flag" ? (leaf.default ?? false) : leaf.default;
      return value === undefined ? [] : [[leaf, value]];
    });
  }

  /**
   * An owner type's rules for a write (`owned`, the fields of `ownerType`). A link among the fields a keeper keeps is
   * refused: a write of its fields clears none of its links.
   */
  private static rulesOf(ownerType: string, owned: Fields): OwnerRules {
    const shown = Object.fromEntries(Object.entries(owned).filter(([, field]) => Field.isKept(field)));
    const keepers = Field.keepersOf(owned);
    if (keepers.length > 0 && Field.leavesOf(shown).some((leaf) => Field.isLinked(leaf)))
      throw new Error(`${ownerType} keeps a link among the fields its form shows, which no write clears`);
    return {
      conditions: FieldWrites.conditionsOf(ownerType, owned),
      defaults: FieldWrites.defaultsOf(owned),
      keptFields: new Set(Field.storedLeavesOf(shown).map((leaf) => leaf.field)),
      keepers,
    };
  }

  /** Each owner type's fields' declarations, by `<owner type>:<field>`. */
  private readonly leaves: ReadonlyMap<string, StoredLeaf>;

  /** Each owner type's rules for a write past each leaf's own. */
  private readonly rules: ReadonlyMap<string, OwnerRules>;

  /**
   * The value a leaf holds after a write (`written`, the write's values by field): its value's, the first, its default
   * when it holds none; when the write doesn't name it, its default for a new owner (`creating`), unknown otherwise.
   */
  private heldValue(leaf: StoredLeaf, written: Readonly<Record<string, FieldWrite>>, creating: boolean) {
    if (!(leaf.field in written)) return creating ? { value: FieldCodec.defaultOf(leaf) } : undefined;
    const [value] = written[leaf.field] as FieldValue[];
    return { value: value ?? FieldCodec.defaultOf(leaf) };
  }

  /**
   * What a write of an owner's fields (`fields`, of `ownerType`, by field) stores of each it names, by field (none a
   * write that clears it), a new owner's (`creating`: what the write doesn't name, it holds none of, but a field always
   * written, its default) or an existing one's (what the write doesn't name, it keeps, which a condition or a keeper
   * the write doesn't name leaves as it is). A field always written that a write clears (null, no value, an empty
   * text) holds its default. A field none declares is left as it is: the write path refuses it.
   */
  written(ownerType: string, fields: Readonly<Record<string, FieldWrite>>, creating: boolean) {
    const written: Record<string, FieldWrite> = {};
    for (const [field, write] of Object.entries(fields)) {
      const leaf = this.leaves.get(`${ownerType}:${field}`);
      written[field] = leaf ? Field.writtenValues(leaf, write) : write;
    }
    const rules = this.rules.get(ownerType);
    if (!rules) return written;
    for (const [leaf, value] of rules.defaults) {
      const held = written[leaf.field] as FieldValue[] | undefined;
      if (held ? held.length === 0 : creating) written[leaf.field] = Field.writtenValues(leaf, value);
    }
    for (const { leaf, on, values } of rules.conditions) {
      if (!(leaf.field in written)) continue;
      const held = this.heldValue(on, written, creating);
      if (held && !isOneOf(held.value, values))
        written[leaf.field] = Field.writtenValues(leaf, FieldCodec.defaultOf(leaf));
    }
    const kept = rules.keepers.map((keeper) => this.heldValue(keeper, written, creating));
    if (kept.some((held) => held !== undefined && !held.value))
      for (const field of Object.keys(written)) if (rules.keptFields.has(field)) written[field] = [];

    return written;
  }
}
