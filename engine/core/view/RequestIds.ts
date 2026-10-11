import RulesError from "@/engine/core/RulesError.ts";

import type { default as RulesetData, ViewEntities } from "./RulesetData.ts";

/** What a refusal calls an entity of each kind. */
const KIND_LABELS: Record<keyof ViewEntities, string> = {
  abilities: "Ability",
  aptitudes: "Aptitude",
  feats: "Feat",
  items: "Item",
  klass_levels: "Class level",
  klasses: "Class",
  languages: "Language",
  mechanics: "Mechanic",
  powers: "Power",
  races: "Race",
  saves: "Save",
  skills: "Skill",
};

/**
 * The entities a request names by id, as its ruleset's view (`rulesetData`) reads them: each the one the view shows in
 * its place, a copy's or a sibling winner's, since the API takes a source's id as well as its copy's. One the view has
 * none of (unknown, of an unrelated ruleset, or one the ruleset deleted) is refused as invalid, naming it: "Item <id>
 * does not belong to `owner`". Every request is read by it as it enters the rules (a level flow's by `LevelRequests`, a
 * character's creation, abilities, languages and inventory by the characters part, an entity's form by its kind's
 * `resolveIds`, a property's value naming an entity by `PropertyEdits`, a class skill's add by `ClassSkills`), so its
 * checks and the rows a save writes read the view's ids, whichever the request sent.
 */
export default class RequestIds {
  /** `owner`: the ruleset a refusal says the entity doesn't belong to ("the character's ruleset", "this ruleset"). */
  constructor(
    private readonly rulesetData: RulesetData,
    private readonly owner: string,
  ) {}

  /** The id the view keys `id` by (`resolve`), not one of those `seen` already: refused, naming it, when it is. */
  private resolveOnce(type: keyof ViewEntities, id: string, seen: Set<string>) {
    const resolved = this.resolve(type, id);
    if (seen.has(resolved)) throw new RulesError("invalid", `${KIND_LABELS[type]} ${id} is given more than once`);
    seen.add(resolved);
    return resolved;
  }

  /** The entity of `type` the view shows for `id`: refused, naming it, when it shows none. */
  find<K extends keyof ViewEntities>(type: K, id: string): ViewEntities[K] {
    const entity = this.rulesetData.find(type, id);
    if (!entity) throw new RulesError("invalid", `${KIND_LABELS[type]} ${id} does not belong to ${this.owner}`);
    return entity;
  }

  /** The id the view keys the entity of `type` named `id` by: refused, naming it, when it shows none. */
  resolve(type: keyof ViewEntities, id: string): string {
    return this.find(type, id).id;
  }

  /**
   * Ids of `type`, each the view's, in the order they came: refused, naming it, when one names none of its entities, or
   * one named already (by the same id, or by its source's and its copy's).
   */
  resolveAll(type: keyof ViewEntities, ids: string[]): string[] {
    const seen = new Set<string>();
    return ids.map((id) => this.resolveOnce(type, id, seen));
  }

  /**
   * Values by the id of the entity of `type` each is for (`byId`), each under the view's id, in the order they came:
   * refused, naming it, when an id names none of its entities, or one another id names (its source's and its copy's).
   */
  resolveKeys<V>(type: keyof ViewEntities, byId: Record<string, V>): Map<string, V> {
    const seen = new Set<string>();
    return new Map(Object.entries(byId).map(([id, value]) => [this.resolveOnce(type, id, seen), value]));
  }
}
