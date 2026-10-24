import { Engine } from "@/engine/index.ts";
import { RULESET_ENTITY_TYPES } from "@/server/repositories/index.ts";

/** The kinds a module's rules keep to themselves, which no route edits (3.5's abilities). */
const READ_ONLY = new Set(
  Object.values(Engine.rules().describeAll()).flatMap((rules) =>
    rules.kinds.flatMap((kind) => (kind.readOnly ? [kind.type] : [])),
  ),
);

/** The ruleset entities a fork can restore to its parent's: every one but those its rules keep to themselves. */
export const RESTORABLE_ENTITY_TYPES = RULESET_ENTITY_TYPES.filter((entityType) => !READ_ONLY.has(entityType));
