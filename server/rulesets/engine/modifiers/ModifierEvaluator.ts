import { isTraversable } from "@/server/rulesets/engine/paths/isTraversable.ts";
import { hasValueType, parseLiteralValue } from "@/server/rulesets/engine/paths/literalValue.ts";
import { readComponent } from "@/server/rulesets/engine/paths/readComponent.ts";
import {
  evaluateTemplateExpression,
  extractReferencedPaths,
  extractTemplateExpression,
  isTemplateValue,
} from "@/server/rulesets/engine/paths/templateExpression.ts";
import type RequirementEvaluator from "@/server/rulesets/engine/requirements/RequirementEvaluator.ts";
import type {
  Component,
  Components,
  TargetPathsTraverser,
  TraversePathResult,
} from "@/server/rulesets/engine/types.ts";
import type { Modifier } from "@/shared/relations.ts";

type ModifierResults = {
  modifiers: Modifier[];
  skippedModifiers: { warning: string; modifier: Modifier }[];
  unappliedModifiers: Modifier[];
  inactiveModifiers: Modifier[];
  appliedModifiers: Modifier[];
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

  /**
   * The source keys (`id:type`) an evaluation of requirements leaves unmet or invalid: a modifier is gated out when its
   * source entity's or its own is among them.
   */
  static blockedKeys(characterRequirements: RequirementEvaluator): Set<string> {
    const blockedKeys = new Set<string>();
    const reqs = characterRequirements.getRequirements();
    for (const group of reqs.unmetRequirementGroups) {
      if (group.length === 0) continue;
      for (const r of group) blockedKeys.add(`${r.entityId}:${r.entityType}`);
    }
    for (const inv of reqs.invalidRequirements)
      blockedKeys.add(`${inv.requirement.entityId}:${inv.requirement.entityType}`);

    return blockedKeys;
  }

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
    modifiers: [],
    appliedModifiers: [],
    unappliedModifiers: [],
    inactiveModifiers: [],
    skippedModifiers: [],
  };

  private applyModifier(modifier: Modifier, result: TraversePathResult, component: Component, components: Components) {
    const { data } = result;

    // Resolve the modifier value — template references or literal conversion
    const typedValue = this.resolveModifierValue(modifier, data, components);
    if (typedValue === null) return;

    if (!hasValueType(data, typeof typedValue)) {
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

    readComponent(component, "updateAvailables");
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
    if (!isTraversable(object)) return this.skip(modifier, `Target ${modifier.target} isn't in an object`);
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
   * The modifier's value, typed: a template reference resolved against the components, or the literal coerced to its value
   * type (which the target's must match). Null when it can't be (each reason recorded).
   */
  private resolveModifierValue(
    modifier: Modifier,
    data: unknown,
    components: Components,
  ): number | string | boolean | null {
    const { value, valueType } = modifier;
    if (isTemplateValue(value)) {
      const resolved = this.resolveTemplateValue(value, components, modifier);
      if (resolved === null) return null;
      // NaN passes `typeof === "number"`; ±Infinity too. Both come from
      // edge cases (zero-arg min/max/floor/ceil/abs, division ambiguities)
      // and would silently corrupt character state if persisted.
      if (typeof resolved === "number" && !Number.isFinite(resolved)) {
        this.skip(modifier, `Template resolved to a non-finite number (${resolved})`);
        return null;
      }
      return resolved;
    }
    if (!hasValueType(data, valueType)) {
      this.skip(modifier, `Value type mismatch: expected ${valueType}, got ${typeof data}`);
      return null;
    }
    const literal = parseLiteralValue(value, valueType);
    if (literal === undefined) {
      this.skip(modifier, `Invalid ${valueType} value: ${JSON.stringify(value)}`);
      return null;
    }
    return literal;
  }

  private resolveTemplateValue(
    template: string,
    components: Components,
    modifier: Modifier,
  ): number | string | boolean | null {
    const expression = extractTemplateExpression(template);
    if (!expression) return null;
    return evaluateTemplateExpression(expression, components, this.targetPaths, (warning) => {
      this.results.skippedModifiers.push({ warning, modifier });
    });
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
          this.results.skippedModifiers.push({
            warning: `Template modifier references "${refPath}" which is written to by another template modifier targeting "${templateModifiers[conflictIdx].target}" — result is order-dependent`,
            modifier,
          });
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
      if (result.error) {
        this.results.skippedModifiers.push({
          warning: result.error,
          modifier,
        });
      } else if (result.component) {
        this.applyModifier(modifier, result, result.component, components);
      }
    }
  }

  evaluateModifiers(components: Components, modifiers: Modifier[], characterRequirements: RequirementEvaluator) {
    // A modifier is dropped if its source entity OR the modifier itself has an unmet or invalid requirement
    const blockedKeys = ModifierEvaluator.blockedKeys(characterRequirements);

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
