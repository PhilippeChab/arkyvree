import { z } from "zod";

/** Whether `value` is a UUID: what a list of ids in a query keeps. */
export function isUuid(value: string) {
  return z.string().uuid().safeParse(value).success;
}

/** A page size: 1–100, defaulting to `fallback` */
export function limitDefaultingTo(fallback: number) {
  return z.coerce.number().min(1).max(100).default(fallback);
}
