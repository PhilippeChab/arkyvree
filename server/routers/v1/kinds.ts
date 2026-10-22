/**
 * An entity kind as v1 names it, in a route and in an answer: its URL segment (`classes`, `class-levels`), a power a
 * spell (`spells`), as the app's screens call it, and an invite the route that reads it (`campaign-invites`).
 */

import { getEntityTypeOfSegment, getUrlSegment } from "@/shared/urlSegments.ts";

/**
 * The kinds v1 renames past their URL segment, by entity type or table: a power is a spell, and an invite (a
 * contributor's too, which its invite's route reads, whatever its status) is the route that reads it.
 */
const V1_SEGMENTS: Readonly<Record<string, string>> = {
  character_contributors: "character-invites",
  contributors: "ruleset-invites",
  invites: "campaign-invites",
  powers: "spells",
};

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
