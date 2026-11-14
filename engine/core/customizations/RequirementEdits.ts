import type { TargetCatalogs, TargetPaths } from "@/engine/core/paths/CategoryPaths.ts";
import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import RulesError from "@/engine/core/RulesError.ts";
import { CUSTOMIZATION_TYPES } from "@/shared/customization/customizationTypes.ts";
import type { TargetPathCatalog } from "@/shared/customization/target.ts";
import type { Requirement } from "@/shared/relations.ts";

import CustomizationEdits from "./CustomizationEdits.ts";
import TargetLabels from "./TargetLabels.ts";

/** A requirement's save, as its form sends it: a condition (`target`) or a group of conditions (`chainingOperator`). */
interface RequirementBody {
  chainingOperator?: string;
  level: string;
  operator?: string;
  target?: string;
  value?: string;
}

/** An entity's requirements: as its page lists them, and what their saves store, checked against their paths. */
export default class RequirementEdits extends CustomizationEdits<Requirement> {
  protected override readonly type = CUSTOMIZATION_TYPES.requirement;

  /** The entity's requirements of its type: its own, and its siblings' (the view composes them, OR-chain-aware). */
  protected override rowsOf(entityId: string) {
    const requirements = this.view.rulesetData.requirementsByEntity.get(entityId) ?? [];
    return requirements.filter((requirement) => requirement.entityType === this.entityType);
  }

  /**
   * The row a requirement's save stores: a condition's target, operator, value (a number as the sheet reads it: "05" is
   * "5") and value type, checked against its path, its chaining operator cleared; or a group's chaining operator, its
   * condition's columns cleared: an edit that turns one into the other leaves nothing of the other (the database holds
   * a row to one). A save that sends neither (its level alone) changes neither.
   */
  private toRow(
    targetPaths: TargetPaths,
    catalogs: TargetCatalogs,
    body: RequirementBody,
    kept?: { operator: string | null; value: string | null },
  ) {
    if (!body.target) {
      if (body.chainingOperator === undefined) return { level: body.level };
      const condition = { operator: null, target: null, value: null, valueType: null };
      return { chainingOperator: body.chainingOperator, level: body.level, ...condition };
    }
    // An update without a value keeps the stored one, checked against the target's type all the same
    const valueType = targetPaths.checkValue(catalogs, {
      kind: "requirement",
      operator: body.operator ?? kept?.operator ?? undefined,
      target: body.target,
      value: body.value ?? kept?.value ?? undefined,
    });
    const value = body.value === undefined ? undefined : LiteralValue.normalize(body.value, valueType);
    return {
      chainingOperator: null,
      level: body.level,
      operator: body.operator,
      target: body.target,
      value,
      valueType,
    };
  }

  /** The entity's requirements of its type, as the view composes them, labeled as its page shows them. */
  describeAll(catalog: TargetPathCatalog) {
    // A row as stored: what the view marks it with to evaluate it (a value whose entity is gone) is the engine's own
    const rows = this.rowsOf(this.entity.id).map((row): Requirement => {
      if (!("valueGone" in row)) return row;
      const { valueGone: _valueGone, ...stored } = row;
      return stored;
    });
    return TargetLabels.describe(catalog, rows);
  }

  /** A new requirement on the entity: the entity as the view has it, and the row it stores. */
  planCreate(targetPaths: TargetPaths, catalogs: TargetCatalogs, body: RequirementBody) {
    const row = this.toRow(targetPaths, catalogs, body);
    const { entity } = this;
    // The levels its page lists: a level a condition the view leaves out holds is one the client can't see
    const levels = this.rowsOf(entity.id).map((requirement) => requirement.level);
    return { bindings: this.bind(targetPaths, row), entity, levels, row };
  }

  /** Deleting one of the entity's requirements: the entity and the requirement, as the view has them. */
  planDelete(requirementId: string) {
    const { entity } = this;
    return { entity, requirement: this.findOwn(entity.id, requirementId) };
  }

  /**
   * An edit of one of the entity's requirements: the entity and the requirement, and the row it stores, and the names
   * its text binds (`bindings`: none to change, `null`, when it changes no text; none at all once it's a group). A group
   * turned into a condition is refused while requirements sit under it, which a condition can't group: the evaluation
   * would drop them.
   */
  planEdit(targetPaths: TargetPaths, catalogs: TargetCatalogs, requirementId: string, body: RequirementBody) {
    // The levels its page lists, as a create reads them: one a condition the view leaves out holds isn't the client's
    const levels = this.rowsOf(this.entity.id).map((requirement) => requirement.level);
    const plan = { ...this.planDelete(requirementId), levels };
    const { level } = plan.requirement;
    if (body.target && plan.requirement.chainingOperator && levels.some((other) => other.startsWith(`${level}.`))) {
      throw new RulesError(
        "conflict",
        "A group with requirements under it can't become a condition: delete the requirements under it first",
      );
    }
    const sent = this.toRow(targetPaths, catalogs, body, plan.requirement);
    // A value it keeps is stored as the view reads it, the text its names are read from
    const kept = sent.target !== undefined && sent.value === undefined ? plan.requirement.value : undefined;
    const row = kept === undefined || kept === null ? sent : { ...sent, value: kept };
    // The row stores the text it's sent, the view's: its names are read anew with it, so text and meaning agree.
    // A value it keeps is read with it
    // A group holds no text: the names its condition read go
    if (row.target === null) return { ...plan, bindings: [], row };
    // A save that sends no target (its level alone) changes no text: what its names mean stays as it is
    if (row.target === undefined && plan.requirement.target !== null) return { ...plan, bindings: null, row };
    const bound = {
      operator: row.operator ?? plan.requirement.operator,
      target: row.target,
      value: row.value ?? plan.requirement.value,
    };
    return { ...plan, bindings: this.bind(targetPaths, bound), row };
  }
}
