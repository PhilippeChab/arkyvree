import type { RulesetEntity } from "@/engine/core/entities/index.ts";
import type { Fields } from "@/engine/core/fields/index.ts";
import type { RulesetView, ViewEntities } from "@/engine/core/view/index.ts";

/** A kind's rules, of its table (`K`): its `RulesetEntity`, whatever form its saves take. */
type Kind<K extends keyof ViewEntities> = RulesetEntity<K, never, object, Fields>;

/**
 * The entity kinds a ruleset answers of, by the schema's tables: each its table's `RulesetEntity`, and those whose
 * pages read more than an entity have it: a class's parts (its levels, its class skills, its table, a level by its id
 * alone), an item's duplicates and variants, and the feats' and powers' lists by pool.
 */
export type EntityKindsContract = { [K in Exclude<keyof ViewEntities, "klass_levels">]: Kind<K> } & {
  feats: {
    openList(where: { aptitudeId?: string; childOnly?: boolean; family?: string }): {
      describe<T extends Record<string, unknown> & { id: string }>(rows: T[]): unknown[];
      filters: object;
      groupFilters: object;
    };
  };
  items: {
    planDuplicate(sourceItemId: string, body: never): unknown;
    planVariants(sourceItemId: string, variants: { description?: string | null; name: string }[]): unknown;
  };
  klasses: {
    describeLevel(levelId: string): unknown;
    levels(klassId: string): {
      describe(levelId: string): unknown;
      describeAll(): unknown;
      planCreate(body: never): unknown;
      planDelete(levelId: string): unknown;
      planEdit(levelId: string, body: never): unknown;
    };
    skills(klassId: string): {
      describe(): unknown;
      planAdd(skillId: string): unknown;
      planRemove(skillId: string): unknown;
    };
    table(klassId: string): {
      describeFeatPools(): unknown;
      describeSpellLists(): unknown;
      describeSpells(): unknown;
      describeSpellsKnown(): unknown;
    };
  };
  powers: {
    openList(where: { aptitudeId?: string; childOnly?: boolean; level?: number }): {
      describe<T extends Record<string, unknown> & { id: string }>(rows: T[]): unknown[];
      filters: object;
    };
  };
};

/** What a ruleset answers of its entities: each kind's rules (`E`), bound to a ruleset's view. */
export default abstract class EntitiesPart<E extends EntityKindsContract> {
  /** A kind's rules (`type`, its table), bound to a ruleset's view. */
  abstract of<K extends keyof E>(view: RulesetView, type: K): E[K];
}
