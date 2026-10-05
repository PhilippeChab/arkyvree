import { getUrlSegment } from "@/shared/urlSegments.ts";

/** The ruleset entities a user customizes: their modifiers, requirements and properties. */
export const CUSTOMIZABLE_ENTITY_TYPES = ["klass_levels", "klasses", "feats", "items", "powers", "races"] as const;

export type CustomizableEntityType = (typeof CUSTOMIZABLE_ENTITY_TYPES)[number];

const customizableEntityTypes = new Set<string>(CUSTOMIZABLE_ENTITY_TYPES);

export type CustomizationOwnerType = (typeof CUSTOMIZATION_OWNER_TYPES)[number];

/** The customization owners with a page of their own: a class's customizations are tabs of its class page. */
export type CustomizationPageType = Exclude<CustomizationOwnerType, "klasses">;

export type PropertyEntityType = (typeof PROPERTY_ENTITY_TYPES)[number];

/** Whether entities of this type are customizable: they own modifiers (sourced by their own type), not only rows. */
export function isCustomizableEntityType(entityType: string): entityType is CustomizableEntityType {
  return customizableEntityTypes.has(entityType);
}

/** What a customization can belong to: a customizable entity, or a modifier, which has requirements of its own. */
export const CUSTOMIZATION_OWNER_TYPES = [...CUSTOMIZABLE_ENTITY_TYPES, "modifiers"] as const;

export const CUSTOMIZATION_PAGE_TYPES = CUSTOMIZATION_OWNER_TYPES.filter(
  (entityType): entityType is CustomizationPageType => entityType !== "klasses",
);

/** An entity's customization page under its ruleset: "class-levels/:id/customization", "feats/:id/customization". */
export function buildCustomizationPath(entityType: CustomizationPageType, entityId: string): string {
  return `${getUrlSegment(entityType)}/${entityId}/customization`;
}

/** The entity type a customization page's URL segment names: "class-levels" a class level's, never "klass_levels". */
export function parseCustomizationSegment(segment: unknown): CustomizationPageType | undefined {
  return CUSTOMIZATION_PAGE_TYPES.find((entityType) => getUrlSegment(entityType) === segment);
}

/** What property types are defined for: a customizable entity, a ruleset or a skill. */
export const PROPERTY_ENTITY_TYPES = [...CUSTOMIZABLE_ENTITY_TYPES, "rulesets", "skills"] as const;
