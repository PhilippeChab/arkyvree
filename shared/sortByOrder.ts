/** `items` in `order`'s order, by each one's key (`keyOf`): one whose key it doesn't name goes after them, as given. */
export function sortByOrder<T>(items: readonly T[], order: readonly string[], keyOf: (item: T) => string): T[] {
  const rank = (item: T) => {
    const at = order.indexOf(keyOf(item));
    return at === -1 ? order.length : at;
  };
  return items.toSorted((a, b) => rank(a) - rank(b));
}
