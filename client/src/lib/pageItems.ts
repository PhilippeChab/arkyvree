/** The first page an infinite query loaded, for what every page repeats (a list's labels, its total). */
export function firstPage<P>(data: { pages: P[] } | undefined): P | undefined {
  return data?.pages[0];
}

/** How many items the pages before the last one hold: the rows already shown when the last page came in. */
export function itemsBeforeLastPage<T>(data: { pages: { items: T[] }[] } | undefined): number {
  return (data?.pages ?? []).slice(0, -1).reduce((sum, page) => sum + page.items.length, 0);
}

/** The items of every page an infinite query has loaded, in order. */
export function pageItems<T>(data: { pages: { items: T[] }[] } | undefined): T[] {
  return data?.pages.flatMap((page) => page.items) ?? [];
}
