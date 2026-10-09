import { extractReferencedPaths, isTemplateValue } from "@/shared/customization/templateExpression.ts";

/** The labels a customization's target and value show: their paths' segments', as the ruleset's paths name them. */
export default class TargetLabels {
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
