/** What every v1 answer is built of: an id, a thing named by its id, a page of a list, and an error. */

import { z } from "zod";

/** What every error answers, with its status. */
export const v1Error = z
  .strictObject({
    cause: z.string(),
    error: z.string().meta({ description: "The error's kind: `NotFoundError`, `BadRequestError`…" }),
    issues: z
      .array(
        z.object({
          category: z.string().meta({ description: "What the issue is about: a field's path (`fields.bab`)" }),
          message: z.string(),
        }),
      )
      .optional()
      .meta({ description: "What a refused request got wrong, one issue each" }),
    message: z.string(),
  })
  .meta({ description: "An error, its status the response's", id: "Error" });

/** A record's id. */
export const v1Id = z.string().meta({ format: "uuid" });

/** A thing (a feat, a spell, an aptitude) named, by its id and its name. */
export const v1Named = z
  .strictObject({ id: v1Id, name: z.string() })
  .meta({ description: "A thing (a feat, a spell, an aptitude) named, by its id and its name", id: "Named" });

/** A page of a list of `item`s, named for them in the document (`FeatPage`). */
export function buildPageSchema<T extends z.ZodType>(item: T) {
  const id = item.meta()?.id;
  if (!id) throw new Error("A page's items are named in the document: `.meta({ id })`");
  return z
    .strictObject({
      items: z.array(item),
      nextPage: z.number().int().nullable().meta({ description: "The next page's number, null on the last" }),
      page: z.number().int(),
    })
    .meta({ description: `A page of ${id} items`, id: `${id}Page` });
}
