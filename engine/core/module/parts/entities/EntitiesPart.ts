import type { KindCapabilities, RulesetEntity } from "@/engine/core/entities/index.ts";
import type { Fields } from "@/engine/core/fields/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { KindRows, RulesetView, ViewRows } from "@/engine/core/view/index.ts";

/** A kind's rules, of its module's kinds (`V`) and its type (`K`): its `RulesetEntity`, whatever form its saves take. */
type Kind<V extends KindRows<V>, K extends keyof V & string> = RulesetEntity<V, K, Fields>;

/**
 * A kind's rules' class (`T`, what it's bound to a view as): what it can do before any view, as its statics declare it
 * (`RulesetEntity.describeCapabilities`).
 */
type KindClass<T> = (new (view: RulesetView) => T) & { describeCapabilities(): KindCapabilities };

/**
 * The entity kinds a module answers of, by their types: of its kinds (`V`, its kinds' entities by type, as it declares
 * them into `ModuleKinds`), those no entity owns (all but `O`, its owned kinds' types), each its type's
 * `RulesetEntity`, whose parts a kind has or refuses (the entities it owns, the links it edits, its progression and its
 * tables: a class's). Any module's, each of any type, by default.
 */
export type EntityKindsContract<V extends KindRows<V> = ViewRows, O extends string = never> = {
  [K in Exclude<keyof V & string, O>]: Kind<V, K>;
};

/**
 * What a ruleset answers of its entities: each kind's rules (`E`, a rules class for each of its kinds no entity owns:
 * of its kinds, `V`, all but its owned ones, `O`), its class by its type (`kinds`), bound to a ruleset's view, and what
 * each can do.
 */
export default abstract class EntitiesPart<
  E extends EntityKindsContract<V, O>,
  V extends KindRows<V> = ViewRows,
  O extends string = never,
> {
  /** Each kind's rules' class, by its type. */
  protected abstract readonly kinds: { [K in keyof E]: KindClass<E[K]> };

  /** A kind's rules' class (`type`): refused, naming it, for a type the ruleset has no kind of. */
  private kindOf<K extends keyof E>(type: K): KindClass<E[K]> {
    if (!Object.hasOwn(this.kinds, type)) throw new Error(`No entity kind ${String(type)} in this module's entities`);
    return this.kinds[type];
  }

  /** What a kind (`type`) can do, as its rules' class declares it (`RulesetEntity.describeCapabilities`). */
  capabilitiesOf(type: keyof E): KindCapabilities {
    return this.kindOf(type).describeCapabilities();
  }

  /**
   * A kind's rules (`type`), bound to a ruleset's view: refused as not found for a kind its module doesn't have
   * (another base rules' kind, which a request may name).
   */
  of<K extends keyof E>(view: RulesetView, type: K): E[K] {
    if (!Object.hasOwn(this.kinds, type))
      throw new RulesError("not-found", `No ${String(type)} in this ruleset's rules`);
    return new (this.kindOf(type))(view);
  }
}
