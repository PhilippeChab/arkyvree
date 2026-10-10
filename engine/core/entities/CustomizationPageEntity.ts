import { PropertyLabels } from "@/engine/core/customizations/index.ts";
import type { Fields, NoFields } from "@/engine/core/fields/index.ts";
import type { ViewEntities } from "@/engine/core/view/index.ts";
import type { Requirement } from "@/shared/relations.ts";

import RulesetEntity from "./RulesetEntity.ts";

/**
 * A kind whose page shows its customizations (a race, a feat, a power, an item, a class level): described with its
 * modifiers, its properties and its requirements, as the view composes them. A class's customizations are tabs of its
 * page, which reads them apart.
 */
export default abstract class CustomizationPageEntity<
  K extends keyof ViewEntities,
  Body extends object,
  Columns extends object = Body,
  S extends Fields = NoFields,
> extends RulesetEntity<K, Body, Columns, S> {
  /**
   * An entity as its page shows it, with its modifiers, its properties (each named for the entity its value names,
   * `PropertyLabels`) and its requirements.
   */
  override describe(id: string) {
    const entity = super.describe(id);
    return {
      ...entity,
      modifiers: this.rulesetData.modifiersBySource.get(entity.id) ?? [],
      properties: PropertyLabels.describe(this.rulesetData, this.propertiesOf(entity)),
      requirements: this.requirementsOf(entity),
    };
  }

  /** The requirements an entity's page shows: its own (an item's, its template's before its own). */
  protected requirementsOf(entity: { id: string }): Requirement[] {
    return this.rulesetData.requirementsByEntity.get(entity.id) ?? [];
  }
}
