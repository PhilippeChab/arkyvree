import type { Holder, Holders, TargetPathsTraverser, TraversePathResult } from "@/server/rulesets/types.ts";
import type { Modifier } from "@/shared/relations.ts";
import type DetailedCharacterRequirements from "./DetailedCharacterRequirements.ts";
import {
  evaluateTemplateExpression,
  extractReferencedPaths,
  extractTemplateExpression,
  isTemplateValue,
} from "./templateExpression.ts";

export type DetailedCharacterComprehensiveModifiers = {
  modifiers: Modifier[];
  skippedModifiers: { warning: string; modifier: Modifier }[];
  unappliedModifiers: Modifier[];
  inactiveModifiers: Modifier[];
  appliedModifiers: Modifier[];
};

export default class DetailedCharacterModifiers {
  private readonly detailedCharacterModifiers: DetailedCharacterComprehensiveModifiers = {
    modifiers: [],
    appliedModifiers: [],
    unappliedModifiers: [],
    inactiveModifiers: [],
    skippedModifiers: [],
  };

  constructor(
    private readonly targetPaths: TargetPathsTraverser,
  ) {}

  // ── Private statics ──────────────────────────────────────────────

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

  // ── Public methods ───────────────────────────────────────────────

  evaluateModifiers(
    holders: Holders,
    modifiers: Modifier[],
    characterRequirements: DetailedCharacterRequirements,
  ) {
    // Precompute the set of "source keys" that gate a modifier out. A modifier
    // is dropped if its source entity OR the modifier itself has an unmet or
    // invalid requirement. Building this once is O(requirements); the previous
    // per-modifier .find + .some scan was O(modifiers × requirements).
    const blockedKeys = new Set<string>();
    const reqs = characterRequirements.getRequirements();
    for (const group of reqs.unmetRequirementGroups) {
      if (group.length === 0) continue;
      for (const r of group) blockedKeys.add(`${r.entityId}:${r.entityType}`);
    }
    for (const inv of reqs.invalidRequirements) {
      blockedKeys.add(`${inv.requirement.entityId}:${inv.requirement.entityType}`);
    }

    const templateModifiers: Modifier[] = [];

    for (const modifier of modifiers) {
      if (!this.filterByRequirements(modifier, blockedKeys)) continue;

      if (isTemplateValue(modifier.value)) {
        templateModifiers.push(modifier);
      } else {
        this.evaluateModifier(modifier, holders);
      }
    }

    // Template modifiers run last so they read final resolved values.
    // Chained modifiers (one template references another template's target)
    // are skipped outright — their result would be order-dependent.
    const chainedIds = this.warnOnTemplateChaining(templateModifiers);
    for (const modifier of templateModifiers) {
      if (chainedIds.has(modifier.id)) continue;
      this.evaluateModifier(modifier, holders);
    }
  }

  evaluateModifier(
    modifier: Modifier,
    holders: Holders,
  ) {
    const { target } = modifier;

    const results = this.targetPaths.traversePathInit(target, holders, { sourceId: modifier.sourceId });
    if (results.length === 0) {
      this.detailedCharacterModifiers.inactiveModifiers.push(modifier);
      return;
    }
    for (const result of results) {
      if (result.error) {
        this.detailedCharacterModifiers.skippedModifiers.push({
          warning: result.error,
          modifier,
        });
      } else if (result.holder) {
        this.applyModifier(modifier, result, holders);
      }
    }
  }

  getModifiers() {
    return this.detailedCharacterModifiers;
  }

  // ── Private methods ──────────────────────────────────────────────

  private filterByRequirements(
    modifier: Modifier,
    blockedKeys: Set<string>,
  ): boolean {
    if (
      blockedKeys.has(`${modifier.sourceId}:${modifier.sourceType}`) ||
      blockedKeys.has(`${modifier.id}:modifiers`)
    ) {
      this.detailedCharacterModifiers.unappliedModifiers.push(modifier);
      return false;
    }
    return true;
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
          if (DetailedCharacterModifiers.pathsOverlap(templateModifiers[j].target, refPath)) {
            conflictIdx = j;
            break;
          }
        }

        if (conflictIdx >= 0) {
          chained.add(modifier.id);
          this.detailedCharacterModifiers.skippedModifiers.push({
            warning: `Template modifier references "${refPath}" which is written to by another template modifier targeting "${templateModifiers[conflictIdx].target}" — result is order-dependent`,
            modifier,
          });
        }
      }
    }
    return chained;
  }

  private resolveTemplateValue(
    template: string,
    holders: Holders,
    modifier: Modifier,
  ): number | string | boolean | null {
    const expression = extractTemplateExpression(template);
    if (!expression) return null;
    return evaluateTemplateExpression(expression, holders, this.targetPaths, (warning) => {
      this.detailedCharacterModifiers.skippedModifiers.push({ warning, modifier });
    });
  }

  private applyModifier(
    modifier: Modifier,
    result: TraversePathResult,
    holders: Holders,
  ) {
    const { value, valueType, operator } = modifier;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { holder, data, object, key } = result as { holder: Holder; data: any; object: any; key: string };

    // Resolve the modifier value — template references or literal conversion
    let typedValue: number | string | boolean;

    if (isTemplateValue(value)) {
      const resolved = this.resolveTemplateValue(value, holders, modifier);
      if (resolved === null) return;
      // NaN passes `typeof === "number"`; ±Infinity too. Both come from
      // edge cases (zero-arg min/max/floor/ceil/abs, division ambiguities)
      // and would silently corrupt character state if persisted.
      if (typeof resolved === "number" && !Number.isFinite(resolved)) {
        this.detailedCharacterModifiers.skippedModifiers.push({
          warning: `Template resolved to a non-finite number (${resolved})`,
          modifier,
        });
        return;
      }
      typedValue = resolved;
    } else {
      // deno-lint-ignore valid-typeof
      if (typeof data !== valueType) {
        this.detailedCharacterModifiers.skippedModifiers.push({
          warning: `Value type mismatch: expected ${valueType}, got ${typeof data}`,
          modifier,
        });
        return;
      }

      switch (valueType) {
        case "number":
          typedValue = Number(value);
          break;
        case "string":
          typedValue = String(value);
          break;
        case "boolean":
          typedValue = Boolean(value);
          break;
        default:
          this.detailedCharacterModifiers.skippedModifiers.push({
            warning: `Unsupported value type: ${valueType}`,
            modifier,
          });
          return;
      }
    }

    if (typeof data !== typeof typedValue) {
      this.detailedCharacterModifiers.skippedModifiers.push({
        warning: `Value type mismatch: expected ${typeof data}, got ${typeof typedValue}`,
        modifier,
      });
      return;
    }

    // Update the value in the parent object
    switch (operator) {
      case "add":
        if (typeof typedValue === "number") {
          object[key] = data + typedValue;
        } else if (typeof typedValue === "string") {
          object[key] = data + typedValue;
        } else if (Array.isArray(object[key])) {
          object[key].push(typedValue);
        } else {
          this.detailedCharacterModifiers.skippedModifiers.push({
            warning: `Addition is not supported for ${valueType}`,
            modifier,
          });
          return;
        }
        break;
      case "subtract":
        if (typeof typedValue === "number") {
          object[key] = data - typedValue;
        } else if (Array.isArray(data)) {
          object[key] = data.filter((item) => item !== typedValue);
        } else {
          this.detailedCharacterModifiers.skippedModifiers.push({
            warning: `Subtraction is not supported for ${valueType}`,
            modifier,
          });
          return;
        }
        break;
      case "multiply":
        if (typeof typedValue === "number") {
          object[key] = data * typedValue;
        } else {
          this.detailedCharacterModifiers.skippedModifiers.push({
            warning: `Multiplication is not supported for ${valueType}`,
            modifier,
          });
          return;
        }
        break;
      case "divide":
        if (typeof typedValue === "number") {
          object[key] = data / typedValue;
        } else {
          this.detailedCharacterModifiers.skippedModifiers.push({
            warning: `Division is not supported for ${valueType}`,
            modifier,
          });
          return;
        }
        break;
      case "set":
        object[key] = typedValue;
        break;
    }

    // Track successful modifier application — use the resolved path so expanded
    // subtypes (e.g. feats.simpleweaponproficiencydagger.possessed) show their
    // actual target instead of repeating the base slug
    const appliedTarget = result.resolvedPath ?? modifier.target;
    this.detailedCharacterModifiers.appliedModifiers.push(
      appliedTarget !== modifier.target ? { ...modifier, target: appliedTarget } : modifier,
    );

    if (holder.updateTotals) {
      holder.updateTotals();
    }

    if (holder.updateAvailables) {
      holder.updateAvailables();
    }
  }
}
