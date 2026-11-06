import type { KindRows } from "./rows.ts";
import type RulesetData from "./RulesetData.ts";

/**
 * A ruleset's view read by a module's own kinds (`V`: its kinds' entities by type, as it declares them into
 * `ModuleKinds`), each kind's entities typed as the module holds them (3.5's `feats`, its `Feat`s). A ruleset's view
 * holds its base rules' module's kinds alone, each as its module declares it: a module's code reads its kinds through
 * it, and code that names no module's kinds reads them as the view holds any kind's (`RulesetData`, each a
 * `ViewEntity`). Its reads are the view's, typed.
 */
export default class DeclaredRows<V extends KindRows<V>> {
  constructor(private readonly rulesetData: RulesetData) {}

  /** A kind's entities by id (`type`), a stored (pre-COW) id resolving to its copy's or its winner's. */
  byId<K extends keyof V & string>(type: K): Map<string, V[K]> {
    return this.rulesetData.byId(type) as Map<string, V[K]>;
  }

  /** The entity of `type` an id names in the view (a stored id its copy or winner): the ruleset's own, or inherited. */
  find<K extends keyof V & string>(type: K, id: string): V[K] | undefined {
    return this.byId(type).get(id);
  }

  /** A kind's entities (`type`), across the chain, as the view composes them. */
  rows<K extends keyof V & string>(type: K): V[K][] {
    return this.rulesetData.rows(type) as V[K][];
  }

  /** A kind's entities by id (`type`), as stored: a stored id isn't resolved. */
  storedById<K extends keyof V & string>(type: K): Map<string, V[K]> {
    return this.rulesetData.storedById(type) as Map<string, V[K]>;
  }
}
