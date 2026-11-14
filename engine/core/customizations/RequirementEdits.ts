import type { TargetCatalogs, TargetPaths } from "@/engine/core/paths/CategoryPaths.ts";
import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import { CUSTOMIZATION_TYPES } from "@/shared/customization/customizationTypes.ts";
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
   * the fields it writes (`rebound`, `ConditionEdit`), and the condition as it reads once edited (`condition`). A
   * condition's target and value are sent only where they changed: one it isn't sent keeps its text as the view reads
   * it, checked with what it's sent, and what its stored bindings (`bound`) mean.
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
    const plan = { ...this.planDelete(requirementId), levels };
    const { requirement } = plan;
    const kept = { bindings: [], condition: {}, rebound: [] };
    // A group's save, or a condition made a group: its chaining operator, and any text it holds keeps its meaning
    if (body.target === undefined && (requirement.target === null || body.chainingOperator !== undefined))
      return { ...plan, ...kept, row: { chainingOperator: body.chainingOperator, level: body.level } };
    // A save of its level alone changes no text
    if (body.target === undefined && body.operator === undefined && body.value === undefined)
      return { ...plan, ...kept, row: { level: body.level } };
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
      row: { level: body.level, ...edit.store(condition) },
    };
  }
}
