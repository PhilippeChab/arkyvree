import type { Module, SeededFields } from "./Modules.ts";

/** The engine bound to a base rules' content, which the seeders and the codegen ask before any ruleset has a view. */
export default class ContentEngine {
  constructor(private readonly module: Module) {}

  /** The paths a book's content can target: what the codegen checks a book's modifiers and requirements against. */
  listBookTargetPaths(...args: Parameters<Module["content"]["listBookTargetPaths"]>) {
    return this.module.content.listBookTargetPaths(...args);
  }

  /** An entity's fields as the properties that keep them: what a seeder writes for them. */
  toEntityProperties<K extends keyof SeededFields>(entityType: K, fields: SeededFields[K]) {
    return this.module.content.toEntityProperties(entityType, fields);
  }
}
