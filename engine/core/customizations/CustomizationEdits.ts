import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

import CustomizedEntity from "./CustomizedEntity.ts";

/**
 * An entity's customizations of one kind (on `entityType`, `entityId`): as its page lists them, and what their saves
 * store. Every kind reads them the same way, from the entity's bucket in the view (`rowsOf`: its own, and its
 * siblings', merged in), and finds one there, or refuses it as not found.
 */
export default abstract class CustomizationEdits<Row extends { id: string }> {
  constructor(
    protected readonly view: RulesetView,
    protected readonly entityType: string,
    protected readonly entityId: string,
  ) {}

  /** What a refusal calls one: "Modifier" in "Modifier not found for this entity". */
  protected abstract readonly label: string;

  /** The kind's rows on the entity (its id in the view), as its page lists them. */
  protected abstract rowsOf(entityId: string): Row[];

  /** The entity, as the view has it: its id there, and its name. Refused as not found. */
  protected get entity() {
    return CustomizedEntity.find(this.view, this.entityType, this.entityId);
  }

  /** One of the rows the entity's page lists, or refused as not found (`message`). */
  protected findOwn(entityId: string, id: string, message = `${this.label} not found for this entity`) {
    const row = this.rowsOf(entityId).find((candidate) => candidate.id === id);
    if (!row) throw new RulesError("not-found", message);
    return row;
  }
}
