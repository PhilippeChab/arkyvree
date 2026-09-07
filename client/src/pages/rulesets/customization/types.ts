// Entity type definitions used across customization components
export type BaseEntityType = "feats" | "klass_levels" | "klasses" | "items" | "powers" | "races";

// Includes the special "modifiers" entity used when customising a single modifier
export type EntityType = BaseEntityType | "modifiers";
