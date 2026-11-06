import type { EntityKinds } from "@/engine/index.ts";

/** A ruleset entity type: a kind a module declares, which no other entity owns. */
export type RulesetEntityType = keyof EntityKinds;
