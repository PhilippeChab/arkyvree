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

/** What property types are defined for: a customizable entity, a ruleset or a skill. */
export type PropertyEntityType = CustomizableEntityType | "rulesets" | "skills";
