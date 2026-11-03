import { Engine, type EntityKinds } from "@/engine/index.ts";

/** A ruleset entity type: a kind a module declares, which no other entity owns. */
export type RulesetEntityType = keyof EntityKinds;

/** Every ruleset entity type, in the order the modules declare them: those no other type owns. */
export const RULESET_ENTITY_TYPES: readonly RulesetEntityType[] = Engine.storage().standaloneKinds();
