/**
 * Customizing an inherited entity copies it into the ruleset: the response's
 * `resolvedEntityId` is then the copy. `tag` marks a request with the entity
 * it was sent for, so `follow` reports the copy of that entity, not of
 * whichever one the page shows by the time the response lands.
 */
export function useCopyFollow(entityId: string, onEntityIdChange?: (copyId: string, sourceId: string) => void) {
  const tag = <T extends object>(request: Promise<T>): Promise<T & { sourceEntityId: string }> =>
    request.then((res) => ({ ...res, sourceEntityId: entityId }));
  // Only a tagged response can be followed: an untagged request is a type error.
  const follow = ({ resolvedEntityId, sourceEntityId }: { resolvedEntityId?: string; sourceEntityId: string }) => {
    if (resolvedEntityId && resolvedEntityId !== sourceEntityId) onEntityIdChange?.(resolvedEntityId, sourceEntityId);
  };
  /** `useRulesetSection` callbacks that follow a copy made by any save. */
  const followCopies = { onCreateSuccess: follow, onUpdateSuccess: follow, onDeleteSuccess: follow };
  return { tag, follow, followCopies };
}
