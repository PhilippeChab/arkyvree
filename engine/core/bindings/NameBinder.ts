import type { TargetPaths } from "@/engine/core/paths/CategoryPaths.ts";
import type { NamedSegment } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import type { NameBindingDraft } from "@/shared/customization/nameBindings.ts";
import { isTemplateValue } from "@/shared/customization/templateExpression.ts";
import { stripSeparators } from "@/shared/text.ts";

import TemplatePaths from "./TemplatePaths.ts";

/** What a binder reads of a row: its target, its operator and its value, as text. */
interface BoundRow {
  operator?: string | null;
  target?: string | null;
  value?: string | null;
}

/** A row's fields a name can sit in. */
const FIELDS = ["target", "value"] as const;

/** The operators under which a value is one entity's name, whole: any other reads text that names none. */
const NAMING_OPERATORS: readonly string[] = ["equal", "not_equal", "set"];

/**
 * What the names in a modifier's or a requirement's paths mean, read in a ruleset's view (`rulesetData`) as the row is
 * saved, by what its ruleset's paths say names an entity (`paths`): for each such segment, the entity it names, kept
 * as the original it stands for (never the view's copy of it, which a restore or an unsubscribe deletes), or a group
 * when it names none (a feat family, a skill family) or a wildcard follows it; and, for a value that is an entity's
 * name (a race's), that entity.
 */
export default class NameBinder {
  constructor(
    private readonly rulesetData: RulesetData,
    private readonly paths: Pick<TargetPaths, "nameSegments" | "valueNames">,
  ) {}

  /** The names of one path: each segment its category says names an entity, a wildcard aside. */
  private bindPath(path: string, place: Pick<NameBindingDraft, "field" | "path">): NameBindingDraft[] {
    const segments = path.split(".");
    return this.paths.nameSegments(path).flatMap((named) => this.bindSegment(segments, named, place));
  }

  private bindSegment(
    segments: string[],
    { entityType, segment, slugOf = stripSeparators }: NamedSegment,
    place: Pick<NameBindingDraft, "field" | "path">,
  ): NameBindingDraft[] {
    const name = segments[segment];
    if (!name || name.includes("*")) return [];
    const slug = stripSeparators(name);
    const at = { ...place, entityType, segment };
    const entity =
      segments[segment + 1] === "*"
        ? undefined
        : this.rulesetData.rows(entityType).find((row) => slugOf(row.name) === slug);
    if (!entity) return [{ ...at, entityId: null, kind: "group", name: slug }];
    return [{ ...at, entityId: this.rulesetData.cow.originalOf(entity.id), kind: "entity", name: entity.name }];
  }

  /** The entity a value names, whole, on a path whose values name one (a race), under an operator that reads a name. */
  private bindValue({ operator, target, value }: BoundRow): NameBindingDraft[] {
    if (!target || !value || isTemplateValue(value) || !NAMING_OPERATORS.includes(operator ?? "")) return [];
    const named = this.paths.valueNames(target);
    if (!named) return [];
    const entity = this.rulesetData
      .rows(named.entityType)
      .find((row) => row.name === value && (named.partition === undefined || row.partition === named.partition));
    if (!entity) return [];
    const { entityType } = named;
    return [
      {
        entityId: this.rulesetData.cow.originalOf(entity.id),
        entityType,
        field: "value",
        kind: "entity",
        name: value,
        path: 0,
        segment: 0,
      },
    ];
  }

  /** What each name in the row's target and value means, in the view. */
  bind(row: BoundRow): NameBindingDraft[] {
    const paths = FIELDS.flatMap((field) =>
      TemplatePaths.list(field, row[field]).flatMap((path, index) => this.bindPath(path, { field, path: index })),
    );
    return [...paths, ...this.bindValue(row)];
  }
}
