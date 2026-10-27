import type { KindCapabilities, RulesetEntity } from "@/engine/core/entities/index.ts";
import type { Fields } from "@/engine/core/fields/index.ts";
import type { RulesetView, StandaloneKind, ViewKinds } from "@/engine/core/view/index.ts";

/** A kind's rules, of its type (`K`): its `RulesetEntity`, whatever form its saves take. */
type Kind<K extends keyof ViewKinds> = RulesetEntity<K, Fields>;

/**
 * The entity kinds a ruleset answers of, by their types, those no entity owns: each its type's `RulesetEntity`, whose
 * parts a kind has or refuses (the entities it owns, the links it edits, its progression and its tables: a class's).
 */
export type EntityKindsContract = { [K in StandaloneKind]: Kind<K> };

/**
 * What a ruleset answers of its entities: each kind's rules (`E`), bound to a ruleset's view, and what each can do
 * before any view.
 */
export default abstract class EntitiesPart<E extends EntityKindsContract> {
  /** What a kind (`type`) can do, as its rules' class declares it (`RulesetEntity.describeCapabilities`). */
  abstract capabilitiesOf(type: keyof E): KindCapabilities;

  /** A kind's rules (`type`), bound to a ruleset's view. */
  abstract of<K extends keyof E>(view: RulesetView, type: K): E[K];
}
