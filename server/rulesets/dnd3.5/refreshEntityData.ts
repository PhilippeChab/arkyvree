/**
 * A pick's or a grant's entity fields as the ruleset's view has them. `CowData.resolveRows` swaps a stored id for the
 * id that stands for it (a fork's copy, a sibling's winner), but the join the row came from read the stored entity's
 * name, description and the like: `keys` takes them from the view's entity (`referenceData`) instead.
 */
export function refreshEntityData<T extends { id: string }, K extends keyof T>(
  rows: T[],
  referenceData: readonly Pick<T, K | "id">[],
  keys: readonly K[],
): T[] {
  if (referenceData.length === 0 || keys.length === 0) return rows;
  const referenceById = new Map(referenceData.map((entity) => [entity.id, entity]));
  return rows.map((row) => {
    const reference = referenceById.get(row.id);
    if (!reference) return row;
    const refreshed = { ...row };
    for (const key of keys) refreshed[key] = reference[key];
    return refreshed;
  });
}
