import { z } from "zod";

import type { EntityFieldValues } from "@/engine/index.ts";
import { sanitizeEmail } from "@/server/emailAddress.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { sanitizeText } from "@/shared/text.ts";

import { isUuid, limitDefaultingTo } from "./schemaBuilders.ts";

/** A route's `:characterId` param */
export const characterIdParam = z.object({ characterId: z.string().uuid() });

/** A route's `:id` param */
export const idParam = z.object({ id: z.string().uuid() });

/** A contributor route's `:id` (the ruleset or character) and `:contributorId` */
export const contributorParams = idParam.extend({ contributorId: z.string().uuid() });

/**
 * An entity's fields, as a body carries them for its ruleset's rules (`fields`), a ruleset's Settings' too: any object,
 * which the engine reads by the fields the ruleset declares, refusing as invalid one that isn't its field's type, in
 * its bounds or among its values.
 */
export const entityFields = z.custom<EntityFieldValues>(
  (value) => isRecord(value),
  "Expected an object of the entity's fields",
);

/** Ruleset entity sorting (name/createdAt/updatedAt, ascending) */
export const entityOrderBy = z.enum(["name", "createdAt", "updatedAt"]).default("name");

/** Comma-separated ids in a query string: what isn't one is dropped, none when the query leaves it out. */
export const idList = z
  .string()
  .optional()
  .transform((value) => value?.split(",").filter(isUuid));

/** Standard limit: 1–100, defaults to 10 */
export const limit = limitDefaultingTo(10);
/** Standard orderDir */
export const orderDirAsc = z.enum(["asc", "desc"]).default("asc");

export const orderDirDesc = z.enum(["asc", "desc"]).default("desc");

/** Standard page parameter: positive integer, defaults to 1 */
export const page = z.coerce.number().min(1).default(1);

/** An email address, sanitized as it's stored, then checked. */
export const sanitizedEmail = z.string().overwrite(sanitizeEmail).email();

/** Text, sanitized as it's stored: a check chained to it (`sanitizedText.min(3)`) reads the sanitized text. */
export const sanitizedText = z.string().overwrite(sanitizeText);
