import type { RulesetModule } from "@/engine/core/module/index.ts";
import { Dnd35Module } from "@/engine/rulesets/dnd3.5/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

/** What a module describes in its own shapes. */
type DescriptionsOf<M> = M extends RulesetModule<infer D, infer _E, infer _F> ? D : never;

/** A module's entity kinds, by table. */
type EntityKindsOf<M> = M extends RulesetModule<infer _D, infer E, infer _F> ? E : never;

/** The fields a module's content seeds, by entity. */
type FieldsOf<M> = M extends RulesetModule<infer _D, infer _E, infer F> ? F : never;

/**
 * The module registered for base rules (`B`), by its own types: read by the rows `MODULES` has, so a row it lacks breaks
 * none of them (`Modules.of` reports it).
 */
type Registered<B extends BaseRules> = (typeof MODULES)[B & keyof typeof MODULES];

/**
 * A method's arguments, as a call through every registered module's (`F`, the union of their methods) takes them: each
 * one every module's method takes, which the module its base rules pick then reads by its own rules.
 */
export type Accepted<F> = [F] extends [(...args: infer A) => unknown] ? A : never;

/** Each entity kind's rules, by its table, any registered module's: what `Engine.for(scope).entities(type)` hands out. */
export type EntityKinds = EntityKindsOf<Registered<BaseRules>>;

/** An entity kind, by its table: what `Engine.for(scope).entities(type)` takes. */
export type EntityType = keyof EntityKinds;

/** The module a handle bound to a ruleset's view asks: its base rules' (the view's), any of them. */
export type Module = ModuleOf<BaseRules>;

/**
 * A base rules' module (`B`), as the contract's parts (`RulesetModule`) over what it describes, its entity kinds and
 * its seeded fields: its own for one base rules (`Engine.forRules(baseRules)`), any registered module's for all of them
 * (`Module`).
 */
export type ModuleOf<B extends BaseRules> = RulesetModule<
  DescriptionsOf<Registered<B>>,
  EntityKindsOf<Registered<B>>,
  FieldsOf<Registered<B>>
>;

/** A module's method's arguments after those a handle binds (`Lead`: the view, and the character or class it's for). */
export type Rest<F, Lead extends unknown[]> = F extends (...args: [...Lead, ...infer R]) => unknown ? R : never;

/**
 * Each base rules' module, built once: a module keeps no state (its parts are fieldless, its factories make new paths
 * on each call). One the database's enum gains has to be written here, or `Modules.of` doesn't compile, and each is
 * checked against the contract part by part there (`ModuleOf`: `RulesetModule`, each part an abstract class of
 * `core/module/parts/`).
 */
const MODULES = {
  "Dungeons & Dragons: 3.5": Dnd35Module.create(),
};

/** The base rules' modules, which the engine's handles ask what their rules answer. */
export default class Modules {
  /** A base rules' module (`B`), by its own types: any registered module's for base rules the caller doesn't know. */
  static of<B extends BaseRules>(baseRules: B): ModuleOf<B> {
    // One module per base rules, the contract's first: a row MODULES lacks or gets wrong is this one error, and `B`
    // reads its own.
    const modules: { [K in BaseRules]: RulesetModule & ModuleOf<K> } = MODULES;
    return modules[baseRules];
  }
}
