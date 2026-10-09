import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView, ViewEntities } from "@/engine/core/view/index.ts";

/**
 * A ruleset's entity kind (its table, `type`), as its rules answer the server of it in a ruleset's view: one found by
 * its id, and described. Every kind's entity extends it, with what saving or deleting one
 * writes (`planCreate`, `planEdit`, `planDelete`): a plain kind's are its columns (`PlainEntity`), and a kind with rules
 * of its own plans its fields, its pools and the feats it makes.
 */
export default abstract class RulesetEntity<K extends keyof ViewEntities> {
  constructor(protected readonly view: RulesetView) {}

  /** What a refusal calls one: "Save" in "Save not found in this ruleset". */
  protected abstract readonly label: string;

  /** The kind's table. */
  abstract readonly type: K;

  /** An entity with its modifiers, properties and requirements, as the view composes them. */
  protected describeCustomized(id: string) {
    const entity = this.find(id);
    return { ...entity, ...this.view.rulesetData.customizationsOf(entity.id) };
  }

  /** An entity as its page shows it: the view's row (a kind adds its fields, its customizations). */
  describe(id: string): ViewEntities[K] {
    return this.find(id);
  }

  /** The entity the view shows for an id: refused when it shows none. */
  find(id: string): ViewEntities[K] {
    const entity = this.view.rulesetData.find(this.type, id);
    if (!entity) throw new RulesError("not-found", `${this.label} not found in this ruleset`);
    return entity;
  }

  /** Deleting an entity (`id`): the entity as the view has it (a kind adds what its delete writes, what refuses it). */
  planDelete(id: string) {
    return { entity: this.find(id) };
  }
}
