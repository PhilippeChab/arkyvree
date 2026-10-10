import BookPaths from "./BookPaths.ts";
import EntityProperties, { type SeededFields } from "./EntityProperties.ts";

/**
 * The 3.5 module's content, as the seeders and the codegen ask of it: what a book's modifiers and requirements can
 * target, and how an entity's fields are kept in its properties.
 */
export default class Dnd35Content {
  /** The target paths a book's generated content may name. */
  listBookTargetPaths(...args: Parameters<typeof BookPaths.listBookTargetPaths>) {
    return BookPaths.listBookTargetPaths(...args);
  }

  /** An entity's fields as the properties that keep them: what a seeder writes for them. */
  toEntityProperties<K extends keyof SeededFields>(entityType: K, fields: SeededFields[K]) {
    return EntityProperties.toEntityProperties(entityType, fields);
  }
}
