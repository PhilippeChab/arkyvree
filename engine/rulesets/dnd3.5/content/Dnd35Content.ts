import { listBookTargetPaths } from "./bookPaths.ts";
import { toEntityProperties } from "./entityProperties.ts";

/**
 * The 3.5 module's content, as the seeders and the codegen ask of it: what a book's modifiers and requirements can
 * target, and how an entity's fields are kept in its properties.
 */
export class Dnd35Content {
  readonly listBookTargetPaths = listBookTargetPaths;

  readonly toEntityProperties = toEntityProperties;
}
