/** The template expression's evaluation: its syntax (`shared/customization/templateExpression.ts`) read on a sheet. */

import type { Components, TargetPathsTraverser } from "@/engine/core/types.ts";
import {
  parseTemplateExpression,
  TEMPLATE_FUNCTIONS,
  type TemplateNode,
} from "@/shared/customization/templateExpression.ts";

/** A template expression read on a sheet: its value, its paths resolved on the character's components. */
export default class TemplateExpression {
  /**
   * Parse and evaluate a template expression. Returns the resolved value, or
   * `null` if any path fails to resolve (warning sent via onWarning).
   *
   * A pure single-path expression returns whatever the path resolves to (so
   * existing string/boolean-valued templates keep working). Any compound
   * expression (arithmetic, function calls) requires numeric operands and
   * returns a number.
   */
  static evaluate(
    expression: string,
    components: Components,
    targetPaths: TargetPathsTraverser,
    onWarning?: (warning: string) => void,
  ): number | string | boolean | null {
    const parsed = parseTemplateExpression(expression);
    if ("error" in parsed) {
      onWarning?.(`Failed to parse template "${expression}": ${parsed.error}`);
      return null;
    }
    const ast = parsed.node;

    const resolvePath = (path: string): number | string | boolean | null => {
      const results = targetPaths.traversePathInit(path, components);
      if (results.length === 0 || results[0].error) {
        onWarning?.(`Path "${path}" could not be resolved`);
        return null;
      }
      // Wildcard paths expand to multiple results — silently using the first
      // is order-dependent. Refuse to guess and warn instead.
      if (results.length > 1) {
        onWarning?.(
          `Path "${path}" expanded to ${results.length} results; template expressions don't aggregate wildcards`,
        );
        return null;
      }
      return results[0].data as number | string | boolean | null;
    };

    const evNumeric = (node: TemplateNode): number | null => {
      switch (node.type) {
        case "number":
          return node.value;
        case "path": {
          const v = resolvePath(node.value);
          if (typeof v !== "number") {
            onWarning?.(`Path "${node.value}" did not resolve to a number (got ${typeof v})`);
            return null;
          }
          return v;
        }
        case "call": {
          // `Object.hasOwn` ensures we only resolve to deliberately-registered
          // functions and not inherited prototype methods (constructor, valueOf,
          // __proto__, etc.) that would otherwise be reachable via FUNCTIONS[name].
          if (!Object.hasOwn(TEMPLATE_FUNCTIONS, node.name)) {
            onWarning?.(`Unknown function "${node.name}"`);
            return null;
          }
          const fn = TEMPLATE_FUNCTIONS[node.name];
          const args: number[] = [];
          for (const a of node.args) {
            const v = evNumeric(a);
            if (v === null) return null;
            args.push(v);
          }
          return fn(...args);
        }
        case "binop": {
          const l = evNumeric(node.left);
          const r = evNumeric(node.right);
          if (l === null || r === null) return null;
          switch (node.op) {
            case "+":
              return l + r;
            case "-":
              return l - r;
            case "*":
              return l * r;
            case "/":
              if (r === 0) {
                onWarning?.(`Template "${expression}" divides by zero`);
                return null;
              }
              return l / r;
          }
          return null;
        }
        case "unary": {
          const a = evNumeric(node.arg);
          return a === null ? null : -a;
        }
      }
    };

    // Pure single-path expression — pass through whatever type the path resolves to.
    if (ast.type === "path") return resolvePath(ast.value);
    return evNumeric(ast);
  }
}
