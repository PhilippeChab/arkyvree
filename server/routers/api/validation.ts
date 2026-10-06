import { z } from "zod";

import { sanitizeEmail, sanitizeText } from "@/shared/text.ts";

import { limitDefaultingTo } from "./schemaBuilders.ts";

/** Standard page parameter: positive integer, defaults to 1 */
export const page = z.coerce.number().min(1).default(1);

/** A route's `:id` param */
export const idParam = z.object({ id: z.string().uuid() });

/** A route's `:characterId` param */
export const characterIdParam = z.object({ characterId: z.string().uuid() });

/** A contributor route's `:id` (the ruleset or character) and `:contributorId` */
export const contributorParams = idParam.extend({ contributorId: z.string().uuid() });

/** Standard orderDir */
export const orderDirAsc = z.enum(["asc", "desc"]).default("asc");
export const orderDirDesc = z.enum(["asc", "desc"]).default("desc");

/** Ruleset entity sorting (name/createdAt/updatedAt, ascending) */
export const entityOrderBy = z.enum(["name", "createdAt", "updatedAt"]).default("name");

/** Text, sanitized as it's stored: a check chained to it (`sanitizedText.min(3)`) reads the sanitized text. */
export const sanitizedText = z.string().overwrite(sanitizeText);

/** An email address, sanitized as it's stored, then checked. */
export const sanitizedEmail = z.string().overwrite(sanitizeEmail).email();

/** Standard limit: 1–100, defaults to 10 */
export const limit = limitDefaultingTo(10);
