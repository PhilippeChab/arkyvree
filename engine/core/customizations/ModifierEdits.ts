import type { TargetCatalogs, TargetPaths } from "@/engine/core/paths/CategoryPaths.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { TargetPathCatalog } from "@/shared/customization/target.ts";
import type { Modifier } from "@/shared/relations.ts";

import CustomizationEdits from "./CustomizationEdits.ts";
import CustomizedEntity from "./CustomizedEntity.ts";
import TargetLabels from "./TargetLabels.ts";

/** A modifier's save, as its form sends it: its target, its operator and its value. */
interface ModifierBody {
  operator: string;
  target: string;
  value: string;
}

/** An entity's modifiers: as its page lists them, and what their saves store, checked against their paths. */
export default class ModifierEdits extends CustomizationEdits<Modifier> {
  protected override readonly label = "Modifier";

  /** The entity's modifiers of its type: its own, and its siblings' (the view composes them into the winner's). */
  protected override rowsOf(entityId: string) {
    const modifiers = this.view.rulesetData.modifiersBySource.get(entityId) ?? [];
    return modifiers.filter((modifier) => modifier.sourceType === this.entityType);
  }

  /** The row a modifier's save stores: its target, operator and value, and their value type, checked against its path. */
  private toRow(targetPaths: TargetPaths, catalogs: TargetCatalogs, body: ModifierBody) {
    const valueType = targetPaths.checkValue(catalogs, { kind: "modifier", sourceType: this.entityType, ...body });
    return { operator: body.operator, target: body.target, value: body.value, valueType };
  }

  /**
   * A modifier, as its page shows it: the entity it's on (`sourceName`), its own requirements, and its target's
   * segments' labels. Its page names its own source, so a modifier found under another entity names that one. Refused
   * when the view has no such entity or modifier.
   */
  describe(catalog: TargetPathCatalog, modifierId: string) {
    const { entity } = this;
    const modifier = this.view.rulesetData.modifiersById.get(modifierId);
    if (!modifier) throw new RulesError("not-found", "Modifier not found");
    const sourceName =
      modifier.sourceId === entity.id && modifier.sourceType === this.entityType
        ? entity.name
        : CustomizedEntity.find(this.view, modifier.sourceType, modifier.sourceId).name;
    const requirements = this.view.rulesetData.requirementsByEntity.get(modifierId) ?? [];
    return {
      ...modifier,
      sourceName,
      requirements: requirements.filter((requirement) => requirement.entityType === "modifiers"),
      targetLabels: TargetLabels.pick([modifier.target, modifier.value], catalog.segmentLabels),
    };
  }

  /** The entity's modifiers of its type, as the view composes them, labeled as a list shows them. */
  describeAll(catalog: TargetPathCatalog) {
    return TargetLabels.describe(catalog, this.rowsOf(this.entity.id));
  }

  /**
   * A new modifier on the entity: the entity as the view has it, and the row it stores, its value checked against
   * its path (`targetPaths`, among `catalogs`). A duplicate (`sourceModifierId`, one of the entity's) takes its
   * source's requirements: refused when it isn't the entity's.
   */
  planCreate(targetPaths: TargetPaths, catalogs: TargetCatalogs, body: ModifierBody, sourceModifierId?: string) {
    const { entity } = this;
    if (sourceModifierId) this.findOwn(entity.id, sourceModifierId, "Source modifier not found for this entity");
    return { entity, row: this.toRow(targetPaths, catalogs, body) };
  }

  /** Deleting one of the entity's modifiers: the entity and the modifier, as the view has them. */
  planDelete(modifierId: string) {
    const { entity } = this;
    return { entity, modifier: this.findOwn(entity.id, modifierId) };
  }

  /** An edit of one of the entity's modifiers: the entity and the modifier, and the row it stores, checked. */
  planEdit(targetPaths: TargetPaths, catalogs: TargetCatalogs, modifierId: string, body: ModifierBody) {
    return { ...this.planDelete(modifierId), row: this.toRow(targetPaths, catalogs, body) };
  }
}
