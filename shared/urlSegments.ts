/** The entity type a URL segment names: its words joined as a type joins them. */
type EntityTypeOfSegment<S extends string> = Replaced<S, "-", "_">;

/** `S` with every `from` read as `to`, as a type: a type's word joins read in a URL (`entity_links` ↔ `entity-links`). */
type Replaced<S extends string, From extends string, To extends string> = S extends `${infer Head}${From}${infer Tail}`
  ? `${Head}${To}${Replaced<Tail, From, To>}`
  : S;

/** An entity type's URL segment: its words joined as a URL joins them. */
type UrlSegment<T extends string> = Replaced<T, "_", "-">;

/** The entity type a URL segment names: what a route hands its service. */
export function getEntityTypeOfSegment<S extends string>(segment: S): EntityTypeOfSegment<S> {
  // TypeScript doesn't compute a template literal type from a runtime string: the value is the one the type names.
  return segment.replaceAll("-", "_") as EntityTypeOfSegment<S>;
}

/**
 * An entity type's word in a URL, a page's path or an API route's: its words joined by hyphens, as a type joins them
 * by underscores (a type of two words, `owner_levels`, is `owner-levels`).
 */
export function getUrlSegment<T extends string>(entityType: T): UrlSegment<T> {
  // As in `getEntityTypeOfSegment`: the value is the one `UrlSegment<T>` names.
  return entityType.replaceAll("_", "-") as UrlSegment<T>;
}

/** These entity types' URL segments: the values a route's `z.enum` accepts before it reads them back as types. */
export function getUrlSegments<T extends string>(entityTypes: readonly T[]): UrlSegment<T>[] {
  return entityTypes.map((entityType) => getUrlSegment(entityType));
}
