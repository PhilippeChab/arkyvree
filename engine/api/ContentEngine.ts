import type { Fields, FieldValues } from "@/engine/core/fields/index.ts";
import type { ContentPart } from "@/engine/core/module/index.ts";

/**
 * The engine bound to a base rules' content, which the seeders and the codegen ask before any ruleset has a view: its
 * module's own, so what it seeds is its own fields (`F`, by entity).
 */
export default class ContentEngine<F extends Record<string, Fields>> {
  constructor(private readonly content: ContentPart<F>) {}

  /** The paths a book's content can target: what the codegen checks a book's modifiers and requirements against. */
  listBookTargetPaths(...args: Parameters<ContentPart<F>["listBookTargetPaths"]>) {
    return this.content.listBookTargetPaths(...args);
  }

  /** An entity's fields as the properties that keep them: what a seeder writes for them. */
  toEntityProperties<K extends keyof F>(entityType: K, fields: FieldValues<F[K]>) {
    return this.content.toEntityProperties(entityType, fields);
  }
}
