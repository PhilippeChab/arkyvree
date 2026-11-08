/**
 * The Party View's columns of characters, in their order: each its own column, but a partly seen character's, its
 * identity alone, a short card, which leaves the rest of its column to the next character, whose card scrolls within
 * it. Two partly seen characters share a column, and the next starts another.
 */
export function groupPartyColumns<T extends { isPartial: boolean }>(characters: readonly T[]) {
  const columns: T[][] = [];
  for (const character of characters) {
    const last = columns.at(-1);
    if (last?.length === 1 && last[0].isPartial) last.push(character);
    else columns.push([character]);
  }
  return columns;
}
