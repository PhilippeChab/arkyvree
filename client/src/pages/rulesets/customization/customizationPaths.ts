import { oneOf } from "@/client/src/lib/oneOf.ts";
import { CUSTOMIZATION_OWNER_TYPES, type CustomizationOwnerType } from "@/shared/customization/entities.ts";

/** The URL segment of an entity type the database names otherwise: a class level's page reads "class-levels". */
const URL_SEGMENTS: Partial<Record<CustomizationOwnerType, string>> = { klass_levels: "class-levels" };

/** An entity's customization page under its ruleset ("class-levels/:id/customization"), as `useOpenEntity` opens it. */
export function customizationPath(entityType: CustomizationOwnerType, entityId: string): string {
  return `${URL_SEGMENTS[entityType] ?? entityType}/${entityId}/customization`;
}

/** The entity type a customization page's URL segment names; its database name still does, for links made before. */
export function entityTypeOfSegment(segment: string | undefined): CustomizationOwnerType | undefined {
  const renamed = Object.entries(URL_SEGMENTS).find(([, urlSegment]) => urlSegment === segment);
  return oneOf(renamed?.[0] ?? segment, CUSTOMIZATION_OWNER_TYPES);
}
