import type { FieldCodec, Fields, FieldValues } from "@/engine/core/fields/index.ts";
import type { PropertyValue } from "@/engine/core/module/parts/entities/index.ts";
import type { TargetPath } from "@/shared/customization/target.ts";

/**
 * What a ruleset answers its content's seeders and codegen, before any ruleset has a view: the paths a book's
 * modifiers and requirements may name, and an entity's fields as the properties that keep them (`F`, the fields it
 * seeds, by entity, each kept by its codec).
 */
export default abstract class ContentPart<F> {
  /** The codecs of the fields its content seeds, by entity: what keeps an entity's fields in its properties. */
  protected abstract readonly codecs: { [K in keyof F]: FieldCodec<Extract<F[K], Fields>> };

  /** The target paths a book's generated content may name, from the names it seeds. */
  abstract listBookTargetPaths(
    names: { abilities: string[]; saves: string[]; skills: string[] },
    kind: "modifier" | "requirement",
  ): TargetPath[];

  /** An entity's fields as the properties that keep them: what a seeder writes for them. */
  toEntityProperties<K extends keyof F>(entityType: K, fields: FieldValues<Extract<F[K], Fields>>): PropertyValue[] {
    return this.codecs[entityType].toProperties(fields);
  }
}
