import { getUrlSegment } from "@/shared/urlSegments.ts";

/**
 * An entity's customization page under its ruleset, by its type and id ("class-levels/:id/customization",
 * "feats/:id/customization"): a customizable kind's but one that owns another's (a class's customizations are tabs of
 * its own page), and a modifier's (its requirements).
 */
export function buildCustomizationPath(entityType: string, entityId: string): string {
  return `${getUrlSegment(entityType)}/${entityId}/customization`;
}
