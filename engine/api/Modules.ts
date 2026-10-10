import type { RulesetModule } from "@/engine/core/module/index.ts";
import { Dnd35Module } from "@/engine/rulesets/dnd3.5/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

/** What the registered modules describe in their own shapes, any of them. */
type DescriptionsOf<M> = M extends RulesetModule<infer D, infer _E, infer _F> ? D : never;

/** The registered modules' entity kinds, by table. */
type EntityKindsOf<M> = M extends RulesetModule<infer _D, infer E, infer _F> ? E : never;

/** The fields the registered modules' content seeds, by entity. */
type FieldsOf<M> = M extends RulesetModule<infer _D, infer _E, infer F> ? F : never;

/** A registered module, by its own types. */
type Registered = (typeof MODULES)[BaseRules];

/** Each entity kind's rules, by its table: what `Engine.for(scope).entities(type)` hands out. */
export type EntityKinds = EntityKindsOf<Registered>;

/** An entity kind, by its table: what `Engine.for(scope).entities(type)` takes. */
export type EntityType = keyof EntityKinds;

/**
 * A base rules' module, as the engine's handles ask it: the contract's parts (`RulesetModule`), over what any registered
 * module describes, its entity kinds and its seeded fields.
 */
export type Module = RulesetModule<DescriptionsOf<Registered>, EntityKinds, SeededFields>;

/** A module's method's arguments after those a handle binds (`Lead`: the view, and the character or class it's for). */
export type Rest<F, Lead extends unknown[]> = F extends (...args: [...Lead, ...infer R]) => unknown ? R : never;

/** The fields the registered modules' content seeds, by entity: what `Engine.forRules(baseRules)` writes. */
export type SeededFields = FieldsOf<Registered>;

/**
 * Each base rules' module, built once: a module keeps no state (its parts are fieldless, its factories make new paths
 * on each call). One the database's enum gains has to be written here, or the engine doesn't compile, and each is
 * checked against the contract part by part (`RulesetModule`, each part an abstract class of `core/module/parts/`).
 */
const MODULES = {
  "Dungeons & Dragons: 3.5": Dnd35Module.create(),
} satisfies Record<BaseRules, RulesetModule>;

/** The base rules' modules, which the engine's handles ask what their rules answer. */
export default class Modules {
  /** A base rules' module, as the contract types it. */
  static of(baseRules: BaseRules): Module {
    return MODULES[baseRules];
  }
}
