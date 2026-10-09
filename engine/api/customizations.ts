import { ModifierEdits, PropertyEdits, RequirementEdits } from "@/engine/core/customizations/index.ts";
import type { RulesetView } from "@/engine/core/types.ts";
import type { TargetPathCatalog } from "@/shared/customization/target.ts";

import { getRulesetModule } from "./modules.ts";

/** The ruleset's target paths: what a customization's target and value are checked against. */
function targetPathsOf(view: RulesetView) {
  return getRulesetModule(view.ruleset.baseRules).createTargetPaths();
}

/** A modifier, as its page shows it: the entity it's on, its own requirements, and its target's labels. */
export function describeModifier(
  view: RulesetView,
  catalog: TargetPathCatalog,
  entityType: string,
  entityId: string,
  modifierId: string,
) {
  return ModifierEdits.describeOne(view, catalog, entityType, entityId, modifierId);
}

/**
 * Modifiers as a list shows them, an entity's or a character's: their target's segments' labels, and their value's
 * name when their path names its values, among the catalog of a modifier's paths.
 */
export function describeModifierList<T extends { target: string; value: string }>(
  catalog: TargetPathCatalog,
  modifiers: T[],
) {
  return ModifierEdits.describe(catalog, modifiers);
}

/** An entity's modifiers of its type, as the view composes them, labeled as a list shows them. */
export function describeModifiers(view: RulesetView, catalog: TargetPathCatalog, entityType: string, entityId: string) {
  return ModifierEdits.describeAll(view, catalog, entityType, entityId);
}

/** An entity's properties of its type, as the view composes them. */
export function describeProperties(view: RulesetView, entityType: string, entityId: string) {
  return PropertyEdits.describeAll(view, entityType, entityId);
}

/** An entity's requirements of its type, as the view composes them, labeled as its page shows them. */
export function describeRequirements(
  view: RulesetView,
  catalog: TargetPathCatalog,
  entityType: string,
  entityId: string,
) {
  return RequirementEdits.describeAll(view, catalog, entityType, entityId);
}

/**
 * A new modifier on an entity, or a duplicate of one of its own: the entity, and its value type, its operator and value
 * checked against its path among the catalogs of a modifier's and a template's paths.
 */
export function planModifierCreate(
  view: RulesetView,
  catalogs: Parameters<typeof ModifierEdits.planCreate>[2],
  change: Parameters<typeof ModifierEdits.planCreate>[3],
) {
  return ModifierEdits.planCreate(view, targetPathsOf(view), catalogs, change);
}

/** Deleting one of an entity's modifiers: the entity and the modifier, refused when either isn't the view's. */
export function planModifierDelete(view: RulesetView, entityType: string, entityId: string, modifierId: string) {
  return ModifierEdits.planDelete(view, entityType, entityId, modifierId);
}

/** An edit of one of an entity's modifiers: the entity, the modifier, and its new value type, checked. */
export function planModifierEdit(
  view: RulesetView,
  catalogs: Parameters<typeof ModifierEdits.planEdit>[2],
  change: Parameters<typeof ModifierEdits.planEdit>[3],
) {
  return ModifierEdits.planEdit(view, targetPathsOf(view), catalogs, change);
}

/** A new property on an entity: the entity, refused when it isn't the view's. */
export function planPropertyCreate(view: RulesetView, entityType: string, entityId: string) {
  return PropertyEdits.planCreate(view, entityType, entityId);
}

/** Deleting a property the entity shows: refused when it's its template's. */
export function planPropertyDelete(view: RulesetView, entityType: string, entityId: string, propertyId: string) {
  return PropertyEdits.planDelete(view, entityType, entityId, propertyId);
}

/** An edit of a property the entity shows: the entity, the property, and whether it overrides its template's. */
export function planPropertyEdit(view: RulesetView, entityType: string, entityId: string, propertyId: string) {
  return PropertyEdits.planEdit(view, entityType, entityId, propertyId);
}

/** A new requirement on an entity: the entity, and the row its save stores, a condition checked against its path. */
export function planRequirementCreate(
  view: RulesetView,
  catalogs: Parameters<typeof RequirementEdits.planCreate>[2],
  change: Parameters<typeof RequirementEdits.planCreate>[3],
) {
  return RequirementEdits.planCreate(view, targetPathsOf(view), catalogs, change);
}

/** Deleting one of an entity's requirements: the entity and the requirement, refused when either isn't the view's. */
export function planRequirementDelete(view: RulesetView, entityType: string, entityId: string, requirementId: string) {
  return RequirementEdits.planDelete(view, entityType, entityId, requirementId);
}

/** An edit of one of an entity's requirements: the entity, the requirement, and the row its save stores, checked. */
export function planRequirementEdit(
  view: RulesetView,
  catalogs: Parameters<typeof RequirementEdits.planEdit>[2],
  change: Parameters<typeof RequirementEdits.planEdit>[3],
) {
  return RequirementEdits.planEdit(view, targetPathsOf(view), catalogs, change);
}
