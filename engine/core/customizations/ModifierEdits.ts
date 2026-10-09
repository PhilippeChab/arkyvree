import type { TargetPaths } from "@/engine/core/paths/CategoryPaths.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { TargetPathCatalog } from "@/shared/customization/target.ts";

import CustomizedEntity from "./CustomizedEntity.ts";
import TargetLabels from "./TargetLabels.ts";

/** The target paths of a modifier's kind and of a template's, which a modifier's value is checked against. */
interface Catalogs {
  paths: TargetPathCatalog;
  templatePaths: TargetPathCatalog;
}

/** A modifier's save, as its form sends it: its target, its operator and its value. */
interface ModifierBody {
  operator: string;
  target: string;
  value: string;
}

/** An entity's modifiers: as a list shows them, and what their saves store, checked against their paths. */
export default class ModifierEdits {
  /** One of the entity's modifiers (`entityId`, as the view has it), or refused as not found (`message`). */
  private static findOwn(view: RulesetView, entityType: string, entityId: string, modifierId: string, message: string) {
    const modifier = view.rulesetData.modifiersById.get(modifierId);
    if (!modifier || modifier.sourceId !== entityId || modifier.sourceType !== entityType)
      throw new RulesError("not-found", message);
    return modifier;
  }

  /**
   * Modifiers as a list shows them, an entity's or a character's: the labels of their target's and their template
   * value's segments (`targetLabels`), and their value's name when their path names its values (`valueLabel`).
   */
  static describe<T extends { target: string; value: string }>(catalog: TargetPathCatalog, modifiers: T[]) {
    const pathMap = new Map(catalog.paths.map((path) => [path.path, path]));
    return modifiers.map((modifier) => ({
      ...modifier,
      valueLabel:
        pathMap.get(modifier.target)?.possibleValues?.find((pv) => pv.value === modifier.value)?.label ?? null,
      targetLabels: TargetLabels.pick([modifier.target, modifier.value], catalog.segmentLabels),
    }));
  }

  /** An entity's modifiers of its type, as its view composes them, labeled as a list shows them. */
  static describeAll(view: RulesetView, catalog: TargetPathCatalog, entityType: string, entityId: string) {
    const entity = CustomizedEntity.find(view, entityType, entityId);
    // Compose step pre-merges sibling modifiers into the winner's bucket with sourceId remapped
    const modifiers = view.rulesetData.modifiersBySource.get(entity.id) ?? [];
    return ModifierEdits.describe(
      catalog,
      modifiers.filter((modifier) => modifier.sourceType === entityType),
    );
  }

  /**
   * A modifier, as its page shows it: the entity it's on (`sourceName`), its own requirements, and its target's
   * segments' labels. Refused when the view has no such entity or modifier.
   */
  static describeOne(
    view: RulesetView,
    catalog: TargetPathCatalog,
    entityType: string,
    entityId: string,
    modifierId: string,
  ) {
    const entity = CustomizedEntity.find(view, entityType, entityId);
    const modifier = view.rulesetData.modifiersById.get(modifierId);
    if (!modifier) throw new RulesError("not-found", "Modifier not found");
    const sourceName =
      modifier.sourceId === entity.id && modifier.sourceType === entityType
        ? entity.name
        : CustomizedEntity.find(view, modifier.sourceType, modifier.sourceId).name;
    const requirements = view.rulesetData.requirementsByEntity.get(modifierId) ?? [];
    return {
      ...modifier,
      sourceName,
      requirements: requirements.filter((requirement) => requirement.entityType === "modifiers"),
      targetLabels: TargetLabels.pick([modifier.target, modifier.value], catalog.segmentLabels),
    };
  }

  /**
   * A new modifier on an entity: the entity as the view has it, and its value type, its operator and value checked
   * against its path (`targetPaths`, among `catalogs`). A duplicate (`sourceModifierId`, one of the entity's) takes its
   * source's requirements: refused when it isn't the entity's.
   */
  static planCreate(
    view: RulesetView,
    targetPaths: TargetPaths,
    catalogs: Catalogs,
    change: { body: ModifierBody; entityId: string; entityType: string; sourceModifierId?: string },
  ) {
    const { body, entityId, entityType, sourceModifierId } = change;
    const entity = CustomizedEntity.find(view, entityType, entityId);
    if (sourceModifierId)
      ModifierEdits.findOwn(view, entityType, entity.id, sourceModifierId, "Source modifier not found for this entity");
    const valueType = targetPaths.checkTargetValue(catalogs, { kind: "modifier", sourceType: entityType, ...body });
    return { entity, valueType };
  }

  /** Deleting one of an entity's modifiers: the entity and the modifier, as the view has them. */
  static planDelete(view: RulesetView, entityType: string, entityId: string, modifierId: string) {
    const entity = CustomizedEntity.find(view, entityType, entityId);
    const modifier = ModifierEdits.findOwn(
      view,
      entityType,
      entity.id,
      modifierId,
      "Modifier not found for this entity",
    );
    return { entity, modifier };
  }

  /**
   * An edit of one of an entity's modifiers: the entity and the modifier, as the view has them, and its new value
   * type, its operator and value checked against its path.
   */
  static planEdit(
    view: RulesetView,
    targetPaths: TargetPaths,
    catalogs: Catalogs,
    change: { body: ModifierBody; entityId: string; entityType: string; modifierId: string },
  ) {
    const { entity, modifier } = ModifierEdits.planDelete(view, change.entityType, change.entityId, change.modifierId);
    const check = { kind: "modifier" as const, sourceType: change.entityType, ...change.body };
    return { entity, modifier, valueType: targetPaths.checkTargetValue(catalogs, check) };
  }
}
