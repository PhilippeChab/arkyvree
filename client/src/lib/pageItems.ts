/** The items of every page an infinite query has loaded, in order. */
export function pageItems<T>(data: { pages: { items: T[] }[] } | undefined): T[] {
  return data?.pages.flatMap((page) => page.items) ?? [];
}
