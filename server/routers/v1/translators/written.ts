/** An item of a list a service answers, by its id, translated: one a request names, or one a write just made. */

import { InternalError, NotFoundError } from "@/server/errors/index.ts";

/** The item of `items` that has an id, translated by `toItem`, or the error its absence is. */
function findTranslated<T extends { id: string }, R>(items: T[], id: string, toItem: (item: T) => R, missing: Error) {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw missing;
  return toItem(item);
}

/** The item of a list that a request names (an inventory entry its update changes): a 404 when there's none. */
export function toV1Found<T extends { id: string }, R>(items: T[], id: string, toItem: (item: T) => R) {
  return findTranslated(items, id, toItem, new NotFoundError("Not found"));
}

/** The item of a list that a write just made: none is the server's error, since the write answered it. */
export function toV1Written<T extends { id: string }, R>(items: T[], id: string, toItem: (item: T) => R) {
  return findTranslated(items, id, toItem, new InternalError("What the write made isn't in what it reads back"));
}
