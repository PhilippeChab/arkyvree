import { z } from "zod";

import type { EntityFieldValues, EntityLinkValues, StepPayload } from "@/engine/index.ts";
import { sanitizeEmail } from "@/server/emailAddress.ts";
import { MAX_DOCUMENT_NAME_LENGTH } from "@/shared/campaignDocuments.ts";
import { MAX_CAMPAIGN_NAME_LENGTH } from "@/shared/campaigns.ts";
import { MAX_CHARACTER_NAME_LENGTH, MAX_ITEM_CHARGES, MAX_ITEM_QUANTITY } from "@/shared/characters.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { MAX_RULESET_NAME_LENGTH } from "@/shared/rulesets.ts";
import { sanitizeName, sanitizeText } from "@/shared/text.ts";

import { isUuid, limitDefaultingTo } from "./schemaBuilders.ts";

/** A field's value as a body sends it: a text, a number or a flag. */
const fieldValue = z.union([z.string(), z.number(), z.boolean()]);

/** A record's name, sanitized as it's stored (`sanitizeName`): a check chained to it reads the sanitized name. */
const sanitizedName = z.string().overwrite(sanitizeName);

/** A campaign's name, sanitized as it's stored (`sanitizedName`): not empty once it is, within its bound. */
export const campaignName = sanitizedName.min(1).max(MAX_CAMPAIGN_NAME_LENGTH);

/**
 * A character's fields, by their keys, which its ruleset reads and checks by their declarations (`FieldCodec.parse`):
 * a single field's value, a set's values, or none.
 */
export const characterFields = z.record(z.string(), z.union([fieldValue, z.array(fieldValue).readonly(), z.null()]));

/** A route's `:characterId` param */
export const characterIdParam = z.object({ characterId: z.string().uuid() });

/** A character's name, sanitized as it's stored (`sanitizedName`): not empty once it is, within its bound. */
export const characterName = sanitizedName.min(1).max(MAX_CHARACTER_NAME_LENGTH);

/** A route's `:id` param */
export const idParam = z.object({ id: z.string().uuid() });

/** A contributor route's `:id` (the ruleset or character) and `:contributorId` */
export const contributorParams = idParam.extend({ contributorId: z.string().uuid() });

/** A campaign's folder's or document's name, sanitized as it's stored (`sanitizedName`): not empty once it is, within its bound. */
export const documentName = sanitizedName.min(1).max(MAX_DOCUMENT_NAME_LENGTH);

/**
 * An entity's fields, as a body carries them for its ruleset's rules (`fields`), a ruleset's Settings' too: any object,
 * which the engine reads by the fields the ruleset declares, refusing as invalid one that isn't its field's type, in
 * its bounds or among its values.
 */
export const entityFields = z.custom<EntityFieldValues>(
  (value) => isRecord(value),
  "Expected an object of the entity's fields",
);

/**
 * An entity's links as its form sends them, by role (a single link's target, a list of links' entries), which the
 * engine reads by its kind's columns, refusing as invalid what they don't take.
 */
export const entityLinks = z.custom<EntityLinkValues>(
  (value) => isRecord(value),
  "Expected an object of the entity's links",
);

/** Ruleset entity sorting (name/createdAt/updatedAt, ascending) */
export const entityOrderBy = z.enum(["name", "createdAt", "updatedAt"]).default("name");

/** The groups an inventory entry is held in, stored from 0 (3.5's weapon sets a hand holds it in): none outside them. */
export const groupIndexes = z.array(z.number().int().min(0)).default([]);

/** Comma-separated groups (3.5's weapon sets), stored from 0: what isn't one is dropped (an empty string is none). */
export const groupIndexList = z.string().transform((value) =>
  value
    .split(",")
    .filter((set) => /^\d+$/.test(set))
    .map(Number),
);

/** Comma-separated ids in a query string: what isn't one is dropped, none when the query leaves it out. */
export const idList = z
  .string()
  .optional()
  .transform((value) => value?.split(",").filter(isUuid));

/** An inventory entry's charges, its total's or those left: none, or as many as their column holds. */
export const itemCharges = z.number().int().min(0).max(MAX_ITEM_CHARGES).nullable().default(null);

/** How many of an item an inventory entry carries: at least one, as many as its column holds. */
export const itemQuantity = z.number().int().min(1).max(MAX_ITEM_QUANTITY);

/** Standard limit: 1–100, defaults to 10 */
export const limit = limitDefaultingTo(10);

/** Standard orderDir */
export const orderDirAsc = z.enum(["asc", "desc"]).default("asc");
export const orderDirDesc = z.enum(["asc", "desc"]).default("desc");

/** Standard page parameter: positive integer, defaults to 1 */
export const page = z.coerce.number().min(1).default(1);

/**
 * A step's payload, as an advancement's wizard or an API client sends it: a list, which the engine reads by its step's
 * mechanic (`Payloads`: a plan's tracks, a value per advancement, the options chosen at each, the points spent on rows,
 * the entities picked in their pools), refusing as invalid one in another shape, and each key an entry gives that its
 * shape doesn't take.
 */
export const stepPayload = z.custom<StepPayload>((value) => Array.isArray(value), "Expected a step's answer: a list");

/** A plan's steps' payloads, by step name: what an advancement's steps are answered with so far. */
export const planSteps = z.record(z.string().min(1), stepPayload);

/** A ruleset's name, sanitized as it's stored (`sanitizedName`): not empty once it is, within its bound. */
export const rulesetName = sanitizedName.min(1).max(MAX_RULESET_NAME_LENGTH);

/** An email address, sanitized as it's stored, then checked. */
export const sanitizedEmail = z.string().overwrite(sanitizeEmail).email();

/** Text, sanitized as it's stored: a check chained to it (`sanitizedText.min(3)`) reads the sanitized text. */
export const sanitizedText = z.string().overwrite(sanitizeText);

/** A character's amount of a scored link's entity (3.5's ability score). */
export const score = z.number().int();

/** A shared sheet's `:shareToken`: the token its owner's share link carries. */
export const shareTokenParam = z.object({ shareToken: z.string().uuid() });

/** A direct upload's `:signedId`: the blob's signed id its upload answered. */
export const signedIdParam = z.object({ signedId: z.string().min(1) });
