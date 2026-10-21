/**
 * An entity kind as v1 names it, in a route and in an answer: its URL segment (`classes`, `class-levels`), a power a
 * spell (`spells`), as the app's screens call it.
 */

import { getEntityTypeOfSegment, getUrlSegment } from "@/shared/urlSegments.ts";

/** The kinds v1 renames past their URL segment, by entity type: a power is a spell. */
const V1_SEGMENTS: Readonly<Record<string, string>> = { powers: "spells" };

/** The entity types v1 renames, by the kind it names them. */
const V1_RENAMED: ReadonlyMap<string, string> = new Map(
  Object.entries(V1_SEGMENTS).map(([entityType, kind]) => [kind, entityType]),
);

/** The entity type, or the table, a kind v1 names stands for: a route's kind read back (`spells` the powers). */
export function toEntityType(kind: string): string {
  return V1_RENAMED.get(kind) ?? getEntityTypeOfSegment(kind);
}

/** An entity type's kind, as v1 names it. */
export function toV1Kind(entityType: string): string {
  return V1_SEGMENTS[entityType] ?? getUrlSegment(entityType);
}
