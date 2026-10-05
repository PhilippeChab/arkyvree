import { z } from "zod";

import { getEntityTypeOfSegment, getUrlSegments } from "@/shared/urlSegments.ts";

/** Standard page parameter: positive integer, defaults to 1 */
export const page = z.coerce.number().min(1).default(1);

/** A route's `:id` param */
export const idParam = z.object({ id: z.string().uuid() });

/** A route's `:characterId` param */
export const characterIdParam = z.object({ characterId: z.string().uuid() });

/** Standard orderDir */
export const orderDirAsc = z.enum(["asc", "desc"]).default("asc");
export const orderDirDesc = z.enum(["asc", "desc"]).default("desc");

/** Ruleset entity sorting (name/createdAt/updatedAt, ascending) */
export const entityOrderBy = z.enum(["name", "createdAt", "updatedAt"]).default("name");

/** Text as it's stored: Unicode-normalized (NFKC) and trimmed. */
export const sanitizeText = (text: string) => text.normalize("NFKC").trim();

/** An email address as it's stored: sanitized text, lowercased. */
export const sanitizeEmail = (email: string) => sanitizeText(email).toLowerCase();

/** An email address, sanitized as it's stored. */
export const sanitizedEmail = z.string().email().transform(sanitizeEmail);

/** A page size: 1–100, defaulting to `fallback` */
export const limitDefaultingTo = (fallback: number) => z.coerce.number().min(1).max(100).default(fallback);

/** Standard limit: 1–100, defaults to 10 */
export const limit = limitDefaultingTo(10);

/**
 * An entity type in a URL, named by its segment ("class-levels", "classes"): the route hands its service the type
 * (`klass_levels`, `klasses`).
 */
export const buildEntityTypeSchema = <T extends string>(entityTypes: readonly T[]) =>
  z.enum(getUrlSegments(entityTypes)).transform((segment) => getEntityTypeOfSegment(segment));
