import type { PropertyTypesProvider } from "./PropertyTypeCatalog.ts";

/**
 * Properties as a stat block shows them, by a ruleset's property types (`provider`): by type, in the order its rules list
 * their types (a type they don't list after those, by name), each type's values in its options' order, then by value.
 * Never in the order their rows come in, which seeded rows, made together, can't give. The view keeps every entity's
 * properties in it.
 */
export default class PropertyOrder {
  constructor(private readonly provider: PropertyTypesProvider) {
    this.typeRanks = new Map(Object.keys(provider.getStaticPropertyTypes()).map((type, rank) => [type, rank]));
  }

  /** Each type's place: the rules' types in their order, as a stat block shows them. */
  private readonly typeRanks: ReadonlyMap<string, number>;

  /** A type's place: its rules' rank, after all of them when they don't list it. */
  private typeRank(type: string) {
    return this.typeRanks.get(type) ?? this.typeRanks.size;
  }

  /** A value's place among its type's options: after all of them when it isn't one. */
  private valueRank({ type, value }: { type: string; value: string }) {
    const options = this.provider.getStaticPropertyValues(type) ?? [];
    const rank = options.indexOf(value);
    return rank === -1 ? options.length : rank;
  }

  /** The properties in the stat block's order. */
  sort<T extends { type: string; value: string }>(properties: readonly T[]): T[] {
    return properties.toSorted(
      (a, b) =>
        this.typeRank(a.type) - this.typeRank(b.type) ||
        a.type.localeCompare(b.type) ||
        this.valueRank(a) - this.valueRank(b) ||
        a.value.localeCompare(b.value),
    );
  }
}
