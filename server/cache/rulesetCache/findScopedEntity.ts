import { NotFoundError } from "@/server/errors/index.ts";

/**
 * The entity `entityId` names in the ruleset's composed view: the ruleset's own, or one inherited through its source
 * chain. A not found otherwise.
 */
export function findScopedEntity<T extends { rulesetId: string }>(
  entities: ReadonlyMap<string, T>,
  entityId: string,
  rulesetId: string,
  sourceChain: string[],
  name: string,
): T {
  const entity = entities.get(entityId);
  if (!entity || (entity.rulesetId !== rulesetId && !sourceChain.includes(entity.rulesetId))) {
    throw new NotFoundError(`${name} not found in this ruleset`);
  }
  return entity;
}
