/** The ruleset entities a user customizes: their modifiers, requirements and properties. */
export const CUSTOMIZABLE_ENTITY_TYPES = ["klass_levels", "klasses", "feats", "items", "powers", "races"] as const;

export type CustomizableEntityType = (typeof CUSTOMIZABLE_ENTITY_TYPES)[number];

const customizableEntityTypes = new Set<string>(CUSTOMIZABLE_ENTITY_TYPES);

/** Whether entities of this type are customizable: they own modifiers (sourced by their own type), not only rows. */
export function isCustomizableEntityType(entityType: string): entityType is CustomizableEntityType {
  return customizableEntityTypes.has(entityType);
}

/** What a customization can belong to: a customizable entity, or a modifier, which has requirements of its own. */
export const CUSTOMIZATION_OWNER_TYPES = [...CUSTOMIZABLE_ENTITY_TYPES, "modifiers"] as const;

export type CustomizationOwnerType = (typeof CUSTOMIZATION_OWNER_TYPES)[number];

/** The URL segment of an entity type the database names otherwise: a class level's page reads "class-levels". */
const URL_SEGMENTS: Partial<Record<CustomizationOwnerType, string>> = { klass_levels: "class-levels" };

/** An entity's customization page under its ruleset: "class-levels/:id/customization", "feats/:id/customization". */
export function buildCustomizationPath(entityType: CustomizationOwnerType, entityId: string): string {
  return `${URL_SEGMENTS[entityType] ?? entityType}/${entityId}/customization`;
}

/** The entity type a customization page's URL segment names: "class-levels" a class level's, never "klass_levels". */
export function parseCustomizationSegment(segment: unknown): CustomizationOwnerType | undefined {
  return CUSTOMIZATION_OWNER_TYPES.find((entityType) => (URL_SEGMENTS[entityType] ?? entityType) === segment);
}

/** What property types are defined for: a customizable entity, a ruleset or a skill. */
export type PropertyEntityType = CustomizableEntityType | "rulesets" | "skills";
