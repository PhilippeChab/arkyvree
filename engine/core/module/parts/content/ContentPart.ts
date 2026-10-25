import type { FieldCodec, Fields, FieldsWrite, FieldValues } from "@/engine/core/fields/index.ts";
import type { TargetPath } from "@/shared/customization/target.ts";

/**
 * What a ruleset answers its content's seeders and codegen, before any ruleset has a view: the paths a book's
 * modifiers and requirements may name, and an entity's fields as the stored values that keep them (`F`, the fields it
 * seeds, by entity, each kept by its codec).
 */
export default abstract class ContentPart<F> {
  /** The codecs of the fields its content seeds, by entity: what keeps an entity's fields in its stored values. */
  protected abstract readonly codecs: { [K in keyof F]: FieldCodec<Extract<F[K], Fields>> };

  /**
   * The target paths a book's generated content may name, from the names it seeds (`names`, by kind: 3.5's abilities',
   * saves' and skills').
   */
  abstract listBookTargetPaths(
    names: Partial<Record<string, string[]>>,
    kind: "modifier" | "requirement",
  ): TargetPath[];

  /**
   * An entity's fields as the write of the stored values that keep them: what a seeder writes for them. A field it
   * leaves out isn't named, so the entity keeps what it has of it, or reads its default (a ruleset's progression: the
   * core rules').
   */
  toFieldsWrite<K extends keyof F>(entityType: K, fields: Partial<FieldValues<Extract<F[K], Fields>>>): FieldsWrite {
    return this.codecs[entityType].write(fields);
  }
}
