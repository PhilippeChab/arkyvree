import { z } from "zod";

import { getEntityTypeOfSegment, getUrlSegments } from "@/shared/urlSegments.ts";

/**
 * An entity type in a URL, named by its segment ("class-levels", "classes"): the route hands its service the type
 * (`klass_levels`, `klasses`).
 */
export function buildEntityTypeSchema<T extends string>(entityTypes: readonly T[]) {
  return z.enum(getUrlSegments(entityTypes)).transform((segment) => getEntityTypeOfSegment(segment));
}

/** Whether `value` is a UUID: what a list of ids in a query keeps. */
export function isUuid(value: string) {
  return z.string().uuid().safeParse(value).success;
}

/** A page size: 1–100, defaulting to `fallback` */
export function limitDefaultingTo(fallback: number) {
  return z.coerce.number().min(1).max(100).default(fallback);
}
