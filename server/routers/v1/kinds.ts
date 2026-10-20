/**
 * An entity kind as v1 names it, in a route and in an answer: its URL segment (`classes`, `class-levels`), a power a
 * spell (`spells`), as the app's screens call it.
 */

import { getUrlSegment } from "@/shared/urlSegments.ts";

/** The kinds v1 renames past their URL segment: a power is a spell. */
const V1_SEGMENTS = { powers: "spells" } as const;

/** An entity type's kind, as v1 names it. */
export function toV1Kind(entityType: string): string {
  return entityType === "powers" ? V1_SEGMENTS.powers : getUrlSegment(entityType);
}
