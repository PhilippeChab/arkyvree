type RenamedType = keyof typeof URL_SEGMENTS;
type RenamedSegment = keyof typeof ENTITY_TYPES;

/** An entity type's URL segment: "class-levels" for klass_levels, "classes" for klasses, the type itself otherwise. */
export type UrlSegment<T extends string> = T extends RenamedType ? (typeof URL_SEGMENTS)[T] : T;

/** The entity type a URL segment names. */
export type EntityTypeOfSegment<S extends string> = S extends RenamedSegment ? (typeof ENTITY_TYPES)[S] : S;

/**
 * An entity type's word in a URL, a page's path or an API route's. The app says "class" where the code says "klass"
 * (`class` is a reserved word): a class level's segment is "class-levels", a class's "classes". Every other entity type
 * is its own segment.
 */
const URL_SEGMENTS = { klass_levels: "class-levels", klasses: "classes" } as const;

/** The other way: the entity type each renamed segment names. */
const ENTITY_TYPES = { "class-levels": "klass_levels", classes: "klasses" } as const;

function isRenamedType(entityType: string): entityType is RenamedType {
  return Object.hasOwn(URL_SEGMENTS, entityType);
}
function isRenamedSegment(segment: string): segment is RenamedSegment {
  return Object.hasOwn(ENTITY_TYPES, segment);
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

/** The entity type a URL segment names: what a route hands its service. */
export function getEntityTypeOfSegment<S extends string>(segment: S): EntityTypeOfSegment<S> {
  // As in `getUrlSegment`: each value is the one `EntityTypeOfSegment<S>` names.
  return (isRenamedSegment(segment) ? ENTITY_TYPES[segment] : segment) as EntityTypeOfSegment<S>;
}
