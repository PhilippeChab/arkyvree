import type { KindCapabilities, RulesetEntity } from "@/engine/core/entities/index.ts";
import type { Fields } from "@/engine/core/fields/index.ts";
import type { RulesetView, StandaloneKind, ViewKinds } from "@/engine/core/view/index.ts";

/** A kind's rules, of its type (`K`): its `RulesetEntity`, whatever form its saves take. */
type Kind<K extends keyof ViewKinds> = RulesetEntity<K, Fields>;

/**
 * A kind's rules' class (`T`, what it's bound to a view as): what it can do before any view, as its statics declare it
 * (`RulesetEntity.describeCapabilities`).
 */
type KindClass<T> = (new (view: RulesetView) => T) & { describeCapabilities(): KindCapabilities };

/**
 * The entity kinds a ruleset answers of, by their types, those no entity owns: each its type's `RulesetEntity`, whose
 * parts a kind has or refuses (the entities it owns, the links it edits, its progression and its tables: a class's).
 */
export type EntityKindsContract = { [K in StandaloneKind]: Kind<K> };

/**
 * What a ruleset answers of its entities: each kind's rules (`E`), its class by its type (`kinds`), bound to a ruleset's
 * view, and what each can do before any view.
 */
export default abstract class EntitiesPart<E extends EntityKindsContract> {
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

  /** A kind's rules (`type`), bound to a ruleset's view. */
  of<K extends keyof E>(view: RulesetView, type: K): E[K] {
    return new (this.kindOf(type))(view);
  }
}
