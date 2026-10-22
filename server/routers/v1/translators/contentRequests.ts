/**
 * A v1 write of a ruleset's content, as its service takes it: the columns v1 names apart (a class's hit die, a race's
 * speed, a skill's key ability, an item's cost and template, a requirement's place) under the names the app's rules
 * read.
 */

/** A class's write, its hit die the service's `hd`. */
export function toClassRequest<T extends { hitDie?: number }>({ hitDie, ...body }: T) {
  return { ...body, hd: hitDie };
}

/** An item's write, its cost and template under the service's names. */
export function toItemRequest<T extends { cost?: number | null; template?: boolean; templateId?: string | null }>({
  cost,
  template,
  templateId,
  ...body
}: T) {
  return { ...body, costGp: cost, isTemplate: template, sourceItemId: templateId };
}

/** A race's write, its speed the service's `baseSpeed`. */
export function toRaceRequest<T extends { speed: number }>({ speed, ...body }: T) {
  return { ...body, baseSpeed: speed };
}

/** A requirement's write, its place in the tree the service's `level`. */
export function toRequirementRequest<T extends { group: string }>({ group, ...body }: T) {
  return { ...body, level: group };
}

/** A skill's write, its key ability the service's `primaryAbilityId`. */
export function toSkillRequest<T extends { abilityId: string }>({ abilityId, ...body }: T) {
  return { ...body, primaryAbilityId: abilityId };
}
