/** The entity type a URL segment names: the renamed type whose segment it is, else the segment itself. */
type EntityTypeOfSegment<S extends string> = S extends RenamedSegment
  ? { [T in RenamedType]: (typeof URL_SEGMENTS)[T] extends S ? T : never }[RenamedType]
  : S;

/** A renamed entity type's URL segment: "class-levels", "classes". */
type RenamedSegment = (typeof URL_SEGMENTS)[RenamedType];

/** An entity type the URL renames: klass_levels, klasses. */
type RenamedType = keyof typeof URL_SEGMENTS;

/** An entity type's URL segment: "class-levels" for klass_levels, "classes" for klasses, the type itself otherwise. */
type UrlSegment<T extends string> = T extends RenamedType ? (typeof URL_SEGMENTS)[T] : T;

/**
 * An entity type's word in a URL, a page's path or an API route's. The app says "class" where the code says "klass"
 * (`class` is a reserved word): a class level's segment is "class-levels", a class's "classes". Every other entity type
 * is its own segment, and a segment is read back as its type through this table too.
 */
const URL_SEGMENTS = { klass_levels: "class-levels", klasses: "classes" } as const;

function isRenamedType(entityType: string): entityType is RenamedType {
  return Object.hasOwn(URL_SEGMENTS, entityType);
}

/** The entity type a URL segment names: what a route hands its service. */
export function getEntityTypeOfSegment<S extends string>(segment: S): EntityTypeOfSegment<S> {
  const renamed = Object.keys(URL_SEGMENTS)
    .filter(isRenamedType)
    .find((entityType) => URL_SEGMENTS[entityType] === segment);
  // As in `getUrlSegment`: each value is the one `EntityTypeOfSegment<S>` names.
  return (renamed ?? segment) as EntityTypeOfSegment<S>;
}

/** An entity type's URL segment: what a page's path or an API route names it by. */
export function getUrlSegment<T extends string>(entityType: T): UrlSegment<T> {
  // TypeScript doesn't narrow a conditional type through a branch: each value is the one `UrlSegment<T>` names.
  return (isRenamedType(entityType) ? URL_SEGMENTS[entityType] : entityType) as UrlSegment<T>;
}

/** These entity types' URL segments: the values a route's `z.enum` accepts before it reads them back as types. */
export function getUrlSegments<T extends string>(entityTypes: readonly T[]): UrlSegment<T>[] {
  return entityTypes.map((entityType) => getUrlSegment(entityType));
}
