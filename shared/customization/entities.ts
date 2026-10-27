/**
 * An entity's customization page under its ruleset, by its type and id ("class-levels/:id/customization",
 * "feats/:id/customization"): a customizable kind's but one that owns another's (a class's customizations are tabs of
 * its own page), and a modifier's (its requirements).
 */
export function buildCustomizationPath(entityType: string, entityId: string): string {
  return `${entityType}/${entityId}/customization`;
}

/**
 * An entity's page in its ruleset (`rulesetId`), by its type and id, on its tab of `section` when given: its
 * customization page when it has one (`hasCustomizationPage`, of `pages`), else its own page (a class's, a skill's).
 */
export function buildEntityPagePath(
  rulesetId: string,
  entityType: string,
  entityId: string,
  pages: ReadonlyMap<string, unknown>,
  section?: string,
): string {
  const page = hasCustomizationPage(entityType, pages)
    ? buildCustomizationPath(entityType, entityId)
    : `${entityType}/${entityId}`;
  return `/rulesets/${rulesetId}/${page}${section ? `/${section}` : ""}`;
}

/**
 * Whether an entity's kind (`entityType`) has a customization page: a modifier's (its requirements), and the kinds
 * whose customizations have one (`pages`, by type: the engine's `customizationPages`), which leave out a kind that owns
 * another (a class's customizations are tabs of its own page).
 */
export function hasCustomizationPage(entityType: string, pages: ReadonlyMap<string, unknown>): boolean {
  return entityType === "modifiers" || pages.has(entityType);
}
