import type { PropertyValue } from "@/engine/core/module/writes.ts";
import type { TargetPath } from "@/shared/customization/target.ts";

/**
 * What a ruleset answers its content's seeders and codegen, before any ruleset has a view: the paths a book's
 * modifiers and requirements may name, and an entity's fields as the properties that keep them (`F`, the fields it
 * seeds, by entity).
 */
export default abstract class ContentPart<F extends object> {
  /** The target paths a book's generated content may name, from the names it seeds. */
  abstract listBookTargetPaths(
    names: { abilities: string[]; saves: string[]; skills: string[] },
    kind: "modifier" | "requirement",
  ): TargetPath[];

  /** An entity's fields as the properties that keep them: what a seeder writes for them. */
  abstract toEntityProperties<K extends keyof F>(entityType: K, fields: F[K]): PropertyValue[];
}
