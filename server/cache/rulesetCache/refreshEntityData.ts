/**
 * After `CowData.resolveRows` swaps FK IDs, data fields (name, description, etc.)
 * still come from the base entity row because the DB join matched the original ID.
 * This function refreshes specified fields from authoritative entity data.
 */
export function refreshEntityData<T extends Record<string, unknown> & { id: string }>(
  rows: T[],
  referenceData: { id: string }[],
  keys: string[],
): T[] {
  if (referenceData.length === 0 || keys.length === 0) return rows;

  const dataMap = new Map<string, Record<string, unknown>>();
  for (const entity of referenceData) {
    dataMap.set(entity.id, entity as Record<string, unknown>);
  }

  return rows.map((row) => {
    const source = dataMap.get(row.id);
    if (!source) return row;
    const result = { ...row };
    for (const key of keys) {
      if (key in source) {
        (result as Record<string, unknown>)[key] = source[key];
      }
    }
    return result;
  });
}
