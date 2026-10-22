/** A page of a list as v1 answers it: its items, its page, and the next one, null on the last. */

/** A page of a list, as v1 answers it. */
export interface V1Page<T> {
  items: T[];
  nextPage: number | null;
  page: number;
}

/** A page a service answers, its items each as `toItem` answers it. */
export function toV1Page<T, R>(
  { items, nextPage, page }: { items: T[]; nextPage?: number; page: number },
  toItem: (item: T) => R,
): V1Page<R> {
  return { items: items.map(toItem), nextPage: nextPage ?? null, page };
}
