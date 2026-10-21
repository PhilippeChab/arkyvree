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

/** Comma-separated weapon sets in a query string, from 0: what isn't one is dropped (an empty string is none). */
export const heldSetList = z.string().transform((value) =>
  value
    .split(",")
    .filter((set) => /^\d+$/.test(set))
    .map(Number),
);

/** The weapon sets a hand holds an inventory entry in, stored from 0: none outside the hands. */
export const heldSets = z.array(z.number().int().min(0));

/** Comma-separated ids in a query string: what isn't one is dropped, none when the query leaves it out. */
export const idList = z
  .string()
  .optional()
  .transform((value) => value?.split(",").filter(isUuid));

/**
 * A level's ability increases in the query string: `abilityId:amount` pairs joined by `;`, what isn't one dropped (an
 * empty string is none).
 */
export const increaseList = z.string().transform((value) =>
  value
    .split(";")
    .map((pair) => pair.split(":"))
    .filter(([abilityId, amount]) => isUuid(abilityId) && /^[1-9]\d*$/.test(amount ?? ""))
    .map(([abilityId, amount]) => ({ abilityId, amount: Number(amount) })),
);

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

/** Comma-separated `skillId:points` points spent on each skill, a whole number: what isn't one is dropped. */
export const skillPoints = z
  .string()
  .optional()
  .transform((value) =>
    value === undefined
      ? undefined
      : Object.fromEntries(
          value
            .split(",")
            .map((pair) => pair.split(":"))
            .filter(([skillId, points]) => isUuid(skillId) && /^\d+$/.test(points ?? ""))
            .map(([skillId, points]) => [skillId, Number(points)]),
        ),
  );
