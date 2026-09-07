import { z } from "zod";

/** Standard page parameter: positive integer, defaults to 1 */
export const page = z.coerce.number().min(1).default(1);

/** Standard limit: 1–100, defaults to 10 */
export const limit = z.coerce.number().min(1).max(100).default(10);

/** Standard orderDir */
export const orderDirAsc = z.enum(["asc", "desc"]).default("asc");
export const orderDirDesc = z.enum(["asc", "desc"]).default("desc");

/** Ruleset entity sorting (name/createdAt/updatedAt, ascending) */
export const entityOrderBy = z.enum(["name", "createdAt", "updatedAt"]).default("name");
