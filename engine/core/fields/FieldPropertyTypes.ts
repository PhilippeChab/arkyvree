import type { PropertyTypesProvider } from "@/engine/core/customizations/index.ts";
import type { PropertyEntityType } from "@/shared/customization/entities.ts";

import Field, { type Fields, type LeafSpec } from "./Field.ts";

/** A flag's values, true first: what its rows hold, in the order a stat block lists them. */
const FLAG_VALUES = ["true", "false"] as const;

/**
 * The property types a ruleset's entities' fields are stored in (`entityFields`, its vocabulary's, by entity type), as
 * its view reads them: each entity type's in the order its fields are declared, and the values each takes when they're
 * a closed list (a flag's, true and false).
 */
export default class FieldPropertyTypes implements PropertyTypesProvider {
  constructor(entityFields: Partial<Record<PropertyEntityType, Fields>>) {
    const leaves = Object.values(entityFields).flatMap((fields) => Field.leavesOf(fields));
    this.types = leaves.map((leaf) => leaf.type);
    this.values = new Map(leaves.flatMap((leaf) => FieldPropertyTypes.closedValuesOf(leaf)));
  }

  /** A leaf's type and its values, when they're a closed list: a flag's, a choice's, a list's or a text's. */
  private static closedValuesOf(leaf: LeafSpec): [string, readonly string[]][] {
    if (leaf.kind === "flag") return [[leaf.type, FLAG_VALUES]];
    return "values" in leaf && leaf.values ? [[leaf.type, leaf.values]] : [];
  }

  private readonly types: readonly string[];

  private readonly values: ReadonlyMap<string, readonly string[]>;

  getTypes(): readonly string[] {
    return this.types;
  }

  getValues(type: string): readonly string[] | null {
    return this.values.get(type) ?? null;
  }
}
