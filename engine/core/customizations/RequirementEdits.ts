import type { TargetCatalogs, TargetPaths } from "@/engine/core/paths/CategoryPaths.ts";
import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import { CUSTOMIZATION_TYPES } from "@/shared/customization/customizationTypes.ts";
import type { NameBindingPlace } from "@/shared/customization/nameBindings.ts";
import type { TargetPathCatalog } from "@/shared/customization/target.ts";
import type { Requirement } from "@/shared/relations.ts";

import ConditionEdit from "./ConditionEdit.ts";
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

/** What a requirement's save stores: a condition's target, operator, value and value type, or a group's chaining operator. */
interface RequirementRow {
  chainingOperator?: string;
  level: string;
  operator?: string;
  target?: string;
  value?: string;
  valueType?: string;
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
   * A condition as a requirement's save stores it: its target, operator, value (a number as the sheet reads it: "05" is
   * "5") and value type, checked against its path.
   */
  private toCondition(
    targetPaths: TargetPaths,
    catalogs: TargetCatalogs,
    condition: { operator?: string; target: string; value?: string },
  ) {
    const { operator, target, value } = condition;
    const valueType = targetPaths.checkValue(catalogs, { kind: "requirement", operator, target, value });
    return {
      operator,
      target,
      value: value === undefined ? undefined : LiteralValue.normalize(value, valueType),
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
    const row: RequirementRow = body.target
      ? { level: body.level, ...this.toCondition(targetPaths, catalogs, { ...body, target: body.target }) }
      : { chainingOperator: body.chainingOperator, level: body.level };
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
   * An edit of one of the entity's requirements: the entity and the requirement, the row it stores, the bindings of
   * the fields it writes (`rebound`, `ConditionEdit`), the condition as it reads once edited (`condition`), and the
   * level of a group it turns into a condition (`ungroupedLevel`, none otherwise), which the server refuses while it
   * stores requirements under that level, the view's or not: a condition groups none, and the evaluation would drop
   * them. A condition's target and value are sent only where they changed: one it isn't sent keeps its text as the
   * view reads it, checked with what it's sent, and what its stored bindings (`bound`) mean. An edit that turns one
   * type into the other leaves nothing of the other (the database holds a row to one): a condition made a group loses
   * its text and its bindings, a group made a condition its chaining operator.
   */
  planEdit(
    targetPaths: TargetPaths,
    catalogs: TargetCatalogs,
    requirementId: string,
    body: RequirementBody,
    bound: readonly { field: string }[],
  ) {
    // The levels its page lists, as a create reads them: one a condition the view leaves out holds isn't the client's
    const levels = this.rowsOf(this.entity.id).map((requirement) => requirement.level);
    const deleted = this.planDelete(requirementId);
    const { requirement } = deleted;
    // A group it turns into a condition: its level, which the server refuses while it stores requirements under it
    const ungroupedLevel = body.target && requirement.chainingOperator ? requirement.level : null;
    const plan = { ...deleted, levels, ungroupedLevel };
    const unchanged = { bindings: [], condition: {}, rebound: [] };
    if (body.target === undefined) {
      // A group's save, or a condition made a group: its chaining operator, and no condition's text or names
      if (body.chainingOperator !== undefined) {
        const cleared = { operator: null, target: null, value: null, valueType: null };
        const row = { chainingOperator: body.chainingOperator, level: body.level, ...cleared };
        const rebound: NameBindingPlace["field"][] = ["target", "value"];
        return { ...plan, ...unchanged, rebound, row };
      }
      // A save of its level alone (a group's, or a condition's without a new operator or value) changes no text
      if (requirement.target === null || (body.operator === undefined && body.value === undefined))
        return { ...plan, ...unchanged, row: { level: body.level } };
    }
    const condition = this.toCondition(targetPaths, catalogs, {
      operator: body.operator ?? requirement.operator ?? undefined,
      target: body.target ?? requirement.target!,
      value: body.value ?? requirement.value ?? undefined,
    });
    const edit = new ConditionEdit({ bound, sent: body, value: requirement.value });
    const bindings = edit.pick(this.bind(targetPaths, condition));
    return {
      ...plan,
      bindings,
      condition,
      rebound: edit.rebound,
      row: { chainingOperator: null, level: body.level, ...edit.store(condition) },
    };
  }
}
