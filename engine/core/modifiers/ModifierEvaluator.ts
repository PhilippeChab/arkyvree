import type { TargetPathsTraverser } from "@/engine/core/paths/CategoryPaths.ts";
import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import PathTraverser, { type Components, type TraversePathResult } from "@/engine/core/paths/PathTraverser.ts";
import TemplateExpression from "@/engine/core/paths/TemplateExpression.ts";
import type RequirementEvaluator from "@/engine/core/requirements/RequirementEvaluator.ts";
import { extractReferencedPaths, isTemplateValue } from "@/shared/customization/templateExpression.ts";
import type { Modifier } from "@/shared/relations.ts";

type ModifierResults = {
  appliedModifiers: Modifier[];
  inactiveModifiers: Modifier[];
  skippedModifiers: { modifier: Modifier; warning: string }[];
  unappliedModifiers: Modifier[];
};

export default class ModifierEvaluator {
  /**
   * `sourcesOf` gives the sources a modifier applies from, each of which a target reading its source resolves by: by
   * default its own.
   */
  constructor(
    private readonly targetPaths: TargetPathsTraverser,
    private readonly sourcesOf: (modifier: Modifier) => string[] = (modifier) => [modifier.sourceId],
  ) {}

  private static pathsOverlap(target: string, referencedPath: string): boolean {
    const targetParts = target.split(".");
    const refParts = referencedPath.split(".");
    const len = Math.min(targetParts.length, refParts.length);
    for (let i = 0; i < len; i++) {
      if (targetParts[i] === "*" || refParts[i] === "*") continue;
      if (targetParts[i] !== refParts[i]) return false;
    }
    return true;
  }

  private readonly results: ModifierResults = {
    appliedModifiers: [],
    unappliedModifiers: [],
    inactiveModifiers: [],
    skippedModifiers: [],
  };

  private applyModifier(modifier: Modifier, result: TraversePathResult, components: Components) {
    const { data } = result;

    // Resolve the modifier value — template references or literal conversion
    const typedValue = this.resolveModifierValue(modifier, data, components);
    if (typedValue === null) return;

    if (!LiteralValue.hasType(data, typeof typedValue)) {
      this.skip(modifier, `Value type mismatch: expected ${typeof data}, got ${typeof typedValue}`);
      return;
    }

    if (!this.applyOperator(modifier, typedValue, result)) return;

    // Track successful modifier application — use the resolved path so expanded
    // subtypes (e.g. skills.craftarmorsmithing.misc) show their actual target
    // instead of repeating the base slug
    const appliedTarget = result.resolvedPath ?? modifier.target;
    this.results.appliedModifiers.push(
      appliedTarget !== modifier.target ? { ...modifier, target: appliedTarget } : modifier,
    );
  }

  /**
   * Applies the modifier's operator to the target's value in its parent object. False when the operator doesn't apply
   * to the value's type (recorded); an unknown operator changes nothing but counts as applied, as it always has.
   */
  private applyOperator(
    modifier: Modifier,
    typedValue: number | string | boolean,
    result: TraversePathResult,
  ): boolean {
    const { operator, valueType } = modifier;
    const { data, object, key } = result;
    // A traversal's object holds its data at its key.
    if (!PathTraverser.isTraversable(object))
      return this.skip(modifier, `Target ${modifier.target} isn't in an object`);
    // A part the sheet computes when read (a total, an ability's share) has a getter and no setter
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (descriptor?.get && !descriptor.set)
      return this.skip(modifier, `Target ${modifier.target} is computed from the sheet: a modifier can't change it`);

    // The caller made sure the data has the value's type: a number meets a number, a string a string.
    switch (operator) {
      case "add":
        if (typeof typedValue === "number" && typeof data === "number") object[key] = data + typedValue;
        else if (typeof typedValue === "string" && typeof data === "string") object[key] = data + typedValue;
        else if (Array.isArray(object[key])) object[key].push(typedValue);
        else return this.skip(modifier, `Addition is not supported for ${valueType}`);
        return true;
      case "subtract":
        if (typeof typedValue === "number" && typeof data === "number") object[key] = data - typedValue;
        else if (Array.isArray(data)) object[key] = data.filter((item) => item !== typedValue);
        else return this.skip(modifier, `Subtraction is not supported for ${valueType}`);
        return true;
      case "multiply":
        if (typeof typedValue !== "number" || typeof data !== "number")
          return this.skip(modifier, `Multiplication is not supported for ${valueType}`);
        object[key] = data * typedValue;
        return true;
      case "divide":
        if (typeof typedValue !== "number" || typeof data !== "number")
          return this.skip(modifier, `Division is not supported for ${valueType}`);
        if (typedValue === 0) return this.skip(modifier, "Divides by zero");
        object[key] = data / typedValue;
        return true;
      case "set":
        object[key] = typedValue;
        return true;
      default:
        return true;
    }
  }

  private filterByRequirements(modifier: Modifier, blockedKeys: Set<string>): boolean {
    if (blockedKeys.has(`${modifier.sourceId}:${modifier.sourceType}`) || blockedKeys.has(`${modifier.id}:modifiers`)) {
      this.results.unappliedModifiers.push(modifier);
      return false;
    }
    return true;
  }

  /**
   * The modifier's value, typed, once its declared type is the target's: a template resolved against the components, or
   * the literal coerced to its value type. Null when it can't be (each reason recorded).
   */
  private resolveModifierValue(
    modifier: Modifier,
    data: unknown,
    components: Components,
  ): number | string | boolean | null {
    const { value, valueType } = modifier;
    if (!LiteralValue.hasType(data, valueType)) {
      this.skip(modifier, `Value type mismatch: expected ${valueType}, got ${typeof data}`);
      return null;
    }
    if (isTemplateValue(value))
      return TemplateExpression.resolve(value, components, this.targetPaths, (warning) => this.skip(modifier, warning));
    const literal = LiteralValue.parse(value, valueType);
    if (literal === undefined) {
      this.skip(modifier, `Invalid ${valueType} value: ${JSON.stringify(value)}`);
      return null;
    }
    return literal;
  }

  /** Records a modifier the engine skipped, with why: it isn't applied. */
  private skip(modifier: Modifier, warning: string): false {
    this.results.skippedModifiers.push({ warning, modifier });
    return false;
  }

  private warnOnTemplateChaining(templateModifiers: Modifier[]): Set<string> {
    const chained = new Set<string>();
    if (templateModifiers.length < 2) return chained;

    for (let i = 0; i < templateModifiers.length; i++) {
      const modifier = templateModifiers[i];
      const refPaths = extractReferencedPaths(modifier.value);
      if (refPaths.length === 0) continue;

      for (const refPath of refPaths) {
        // Compare by modifier identity (index), not by target string —
        // two modifiers with the SAME target both reading that target
        // produce order-dependent results and must be flagged.
        let conflictIdx = -1;
        for (let j = 0; j < templateModifiers.length; j++) {
          if (j === i) continue;
          if (ModifierEvaluator.pathsOverlap(templateModifiers[j].target, refPath)) {
            conflictIdx = j;
            break;
          }
        }

        if (conflictIdx >= 0) {
          chained.add(modifier.id);
          this.skip(
            modifier,
            `Template modifier references "${refPath}" which is written to by another template modifier targeting "${templateModifiers[conflictIdx].target}" — result is order-dependent`,
          );
        }
      }
    }
    return chained;
  }

  evaluateModifier(modifier: Modifier, components: Components) {
    const { target } = modifier;

    const results = this.sourcesOf(modifier).flatMap((sourceId) =>
      this.targetPaths.traversePathInit(target, components, { sourceId }),
    );
    if (results.length === 0) {
      this.results.inactiveModifiers.push(modifier);
      return;
    }
    for (const result of results) {
      if (result.error) this.skip(modifier, result.error);
      else if (result.component) this.applyModifier(modifier, result, components);
    }
  }

  evaluateModifiers(components: Components, modifiers: Modifier[], characterRequirements: RequirementEvaluator) {
    // A modifier is dropped if its source entity OR the modifier itself has an unmet or invalid requirement
    const blockedKeys = characterRequirements.getBlockedKeys();

    const templateModifiers: Modifier[] = [];

    for (const modifier of modifiers) {
      if (!this.filterByRequirements(modifier, blockedKeys)) continue;

      if (isTemplateValue(modifier.value)) templateModifiers.push(modifier);
      else this.evaluateModifier(modifier, components);
    }

    // Template modifiers run last so they read final resolved values.
    // Chained modifiers (one template references another template's target)
    // are skipped outright — their result would be order-dependent.
    const chainedIds = this.warnOnTemplateChaining(templateModifiers);
    for (const modifier of templateModifiers) {
      if (chainedIds.has(modifier.id)) continue;
      this.evaluateModifier(modifier, components);
    }
  }

  getModifiers() {
    return this.results;
  }
}
