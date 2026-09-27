/**
 * Customizing an inherited entity copies it into the ruleset: the response's
 * `resolvedEntityId` is then the copy. `tag` marks a request with the entity
 * it was sent for, so `follow` reports the copy of that entity, not of
 * whichever one the page shows by the time the response lands.
 */
export function useCopyFollow(entityId: string, onEntityIdChange?: (copyId: string, sourceId: string) => void) {
  const tag = <T extends object>(request: Promise<T>) => request.then((res) => ({ ...res, sourceEntityId: entityId }));
  const follow = (data: unknown) => {
    const { resolvedEntityId, sourceEntityId } = data as { resolvedEntityId?: string; sourceEntityId?: string };
    if (resolvedEntityId && sourceEntityId && resolvedEntityId !== sourceEntityId) {
      onEntityIdChange?.(resolvedEntityId, sourceEntityId);
    }
  };
  return { tag, follow };
}
