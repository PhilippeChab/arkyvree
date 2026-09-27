/** The items of every page an infinite query has loaded, in order. */
export const pageItems = <T>(data: { pages: { items: T[] }[] } | undefined): T[] =>
  data?.pages.flatMap((page) => page.items) ?? [];
