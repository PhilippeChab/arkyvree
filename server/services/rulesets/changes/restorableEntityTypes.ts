import { RULESET_ENTITY_TYPES, type RulesetEntityType } from "@/server/repositories/index.ts";

/** The ruleset entities a fork can restore to its parent's: every one but abilities, which no route edits. */
export type RestorableEntityType = Exclude<RulesetEntityType, "abilities">;

export const RESTORABLE_ENTITY_TYPES = RULESET_ENTITY_TYPES.filter(
  (entityType): entityType is RestorableEntityType => entityType !== "abilities",
);
