import RulesError from "@/engine/core/RulesError.ts";

import DeclaredRows from "./DeclaredRows.ts";
import type { KindRows, ViewEntity, ViewRows } from "./rows.ts";
import type RulesetData from "./RulesetData.ts";

/**
 * The entities a request names by id, as its ruleset's view (`rulesetData`) reads them: each the one the view shows in
 * its place, a copy's or a sibling winner's, since the API takes a source's id as well as its copy's. One the view has
 * none of (unknown, of an unrelated ruleset, or one the ruleset deleted) is refused as invalid, naming it: "Item <id>
 * does not belong to `owner`". Every request is read by it as it enters the rules (an advancement flow's by
 * `AdvancementRequests`, a character's creation, abilities, languages and inventory by the characters part, an entity's
 * form by its kind's `resolveIds`, a field naming an entity by its kind's codec (`FieldCodec.parse`), a link's add by
 * its kind's rules), so its checks and the rows a save writes read the view's ids, whichever the request sent. It reads
 * the entities as a module declares its kinds (`V`, `DeclaredRows`): any kind's, as the view holds them, by default.
 */
export default class RequestIds<V extends KindRows<V> = ViewRows> {
  /** `owner`: the ruleset a refusal says the entity doesn't belong to ("the character's ruleset", "this ruleset"). */
  constructor(
    private readonly rulesetData: RulesetData,
    private readonly owner: string,
  ) {}

  /** The id the view keys `id` by (`resolve`), not one of those `seen` already: refused, naming it, when it is. */
  private resolveOnce(type: keyof V & string, id: string, seen: Set<string>) {
    const resolved = this.resolve(type, id);
    if (seen.has(resolved))
      throw new RulesError("invalid", `${this.rulesetData.labelOf(type)} ${id} is given more than once`);
    seen.add(resolved);
    return resolved;
  }

  /** The entity of `type` the view shows for `id`: refused, naming it, when it shows none. */
  find<K extends keyof V & string>(type: K, id: string): V[K] {
    const entity = new DeclaredRows<V>(this.rulesetData).find(type, id);
    if (!entity)
      throw new RulesError("invalid", `${this.rulesetData.labelOf(type)} ${id} does not belong to ${this.owner}`);
    return entity;
  }

  /**
   * The entity of a kind a character's inventory holds the view shows for `id` (`RulesetData.findItem`): refused, naming
   * it by its kinds' word ("Item <id> does not belong to …"), when it shows none.
   */
  findItem(id: string): ViewEntity {
    const item = this.rulesetData.findItem(id);
    if (item) return item;
    const label = this.rulesetData
      .inventoryTypes()
      .map((type) => this.rulesetData.labelOf(type))
      .join(" or ");
    throw new RulesError("invalid", `${label} ${id} does not belong to ${this.owner}`);
  }

  /** The id the view keys the entity of `type` named `id` by: refused, naming it, when it shows none. */
  resolve(type: keyof V & string, id: string): string {
    return this.find(type, id).id;
  }

  /**
   * Ids of `type`, each the view's, in the order they came: refused, naming it, when one names none of its entities, or
   * one named already (by the same id, or by its source's and its copy's).
   */
  resolveAll(type: keyof V & string, ids: string[]): string[] {
    const seen = new Set<string>();
    return ids.map((id) => this.resolveOnce(type, id, seen));
  }

  /**
   * Values by the id of the entity of `type` each is for (`byId`), each under the view's id, in the order they came:
   * refused, naming it, when an id names none of its entities, or one another id names (its source's and its copy's).
   */
  resolveKeys<T>(type: keyof V & string, byId: Record<string, T>): Map<string, T> {
    const seen = new Set<string>();
    return new Map(Object.entries(byId).map(([id, value]) => [this.resolveOnce(type, id, seen), value]));
  }
}
