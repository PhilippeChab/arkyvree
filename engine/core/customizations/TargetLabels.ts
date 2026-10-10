import type { TargetPathCatalog } from "@/shared/customization/target.ts";
import { extractReferencedPaths, isTemplateValue } from "@/shared/customization/templateExpression.ts";

/** The labels a customization's target and value show: their paths' segments', as the ruleset's paths name them. */
export default class TargetLabels {
  /**
   * Customizations as a list shows them, an entity's modifiers or requirements, or a character's: the labels of their
   * target's and their value's segments (`targetLabels`), and their value's name when their path names its values
   * (`valueLabel`). A requirement group, which targets nothing, has neither.
   */
  static describe<T extends { target?: string | null; value?: string | null }>(catalog: TargetPathCatalog, rows: T[]) {
    const pathMap = new Map(catalog.paths.map((path) => [path.path, path]));
    return rows.map((row) => {
      const { target, value } = row;
      const possibleValues = target ? pathMap.get(target)?.possibleValues : undefined;
      return {
        ...row,
        valueLabel: value ? (possibleValues?.find((pv) => pv.value === value)?.label ?? null) : null,
        targetLabels: target ? TargetLabels.pick([target, value ?? ""], catalog.segmentLabels) : {},
      };
    });
  }

  /**
   * The labels of the segments `targets` name, picked from `segmentLabels`. A target is a path (`saves.fortitude.misc`)
   * or a template value, whose paths it reads (`extractReferencedPaths`): a bare one (`{{ abilities.charisma.modifier }}`),
   * or those an expression brackets (`{{ floor([classes.ranger.level] / 2) }}`).
   */
  static pick(targets: string[], segmentLabels: Record<string, string>): Record<string, string> {
    const labels: Record<string, string> = {};
    for (const target of targets) {
      const paths = isTemplateValue(target) ? extractReferencedPaths(target) : [target];
      for (const path of paths)
        for (const segment of path.split(".")) if (segment in segmentLabels) labels[segment] = segmentLabels[segment];
    }
    return labels;
  }
}
