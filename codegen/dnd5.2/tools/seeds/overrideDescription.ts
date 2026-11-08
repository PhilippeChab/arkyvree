/**
 * The description an entry's reference gives it in its overrides, in our own words, as Pathfinder's classes and races
 * have theirs: a class's, a species', a weapon's and an armor's, which the SRD 5.2.1 and its data give none of (a class
 * opens on its Core Traits table, a weapon is a row of the Weapons table). Refused when the overrides give it none.
 */
export function readOverrideDescription(entry: { description?: string; name: string }, what: string): string {
  if (!entry.description) throw new Error(`${entry.name}: no ${what} description in its reference's overrides`);
  return entry.description;
}
