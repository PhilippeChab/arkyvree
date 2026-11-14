import type { TargetCatalogs, TargetPaths } from "@/engine/core/paths/CategoryPaths.ts";
import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import { CUSTOMIZATION_TYPES } from "@/shared/customization/customizationTypes.ts";
import type { NameBindingDraft } from "@/shared/customization/nameBindings.ts";
import type { TargetPathCatalog } from "@/shared/customization/target.ts";
import type { Modifier } from "@/shared/relations.ts";

import ConditionEdit from "./ConditionEdit.ts";
import CustomizationEdits from "./CustomizationEdits.ts";
import CustomizedEntity from "./CustomizedEntity.ts";
import TargetLabels from "./TargetLabels.ts";

/** A modifier's save, as its form sends it: its target, its operator and its value. */
interface ModifierBody {
  operator: string;
  target: string;
  value: string;
}

/** A modifier's edit, as its form sends it: its operator, and its target and its value only where they changed. */
interface ModifierEditBody {
  operator: string;
  target?: string;
  value?: string;
}

/** An entity's modifiers: as its page lists them, and what their saves store, checked against their paths. */
export default class ModifierEdits extends CustomizationEdits<Modifier> {
  /**
   * A modifier's edit on a source of `sourceType`: the row it stores and the bindings of the fields it writes
   * (`rebound`, `ConditionEdit`), and the modifier as it reads once edited (`condition`), checked against its path
   * (`targetPaths`, among `catalogs`). A field it isn't sent keeps its text as the view reads the modifier (`current`,
   * under its entities' names there), and what its names mean. `bind` reads what a condition's names mean in the view.
   */
  static planChange(
    targetPaths: TargetPaths,
    catalogs: TargetCatalogs,
    sourceType: string,
    edit: { body: ModifierEditBody; current: ModifierBody },
    bind: (condition: ModifierBody) => NameBindingDraft[],
  ) {
    const { body, current } = edit;
    const condition = ModifierEdits.rowOf(targetPaths, catalogs, sourceType, {
      operator: body.operator,
      target: body.target ?? current.target,
      value: body.value ?? current.value,
    });
    const change = new ConditionEdit(body);
    return { bindings: change.pick(bind(condition)), condition, rebound: change.rebound, row: change.store(condition) };
  }

  /**
   * The row a modifier's save stores on a source of `sourceType`: its target, its operator, and its value as the sheet
   * reads it (a number normalized: "02" is "2"), with their value type, checked against its path (`targetPaths`, among
   * `catalogs`). Refused as invalid with what's wrong.
   */
  static rowOf(targetPaths: TargetPaths, catalogs: TargetCatalogs, sourceType: string, body: ModifierBody) {
    const { operator, target, value } = body;
    const valueType = targetPaths.checkValue(catalogs, { kind: "modifier", operator, sourceType, target, value });
    return { operator, target, value: LiteralValue.normalize(value, valueType), valueType };
  }

  protected override readonly type = CUSTOMIZATION_TYPES.modifier;

  /** The entity's modifiers of its type: its own, and its siblings' (the view composes them into the winner's). */
  protected override rowsOf(entityId: string) {
    const modifiers = this.view.rulesetData.modifiersBySource.get(entityId) ?? [];
    return modifiers.filter((modifier) => modifier.sourceType === this.entityType);
  }

  /**
   * A modifier, as its page shows it: the entity it's on (`sourceName`), its own requirements, and its target's
   * segments' labels. Its page names its own source, so a modifier found under another entity names that one. Refused
   * when the view has no such entity or modifier.
   */
  describe(catalog: TargetPathCatalog, modifierId: string) {
    const { entity } = this;
    const modifier = this.view.rulesetData.modifiersById.get(modifierId);
    if (!modifier) throw this.view.rulesetData.notFound(this.type);
    const sourceName =
      modifier.sourceId === entity.id && modifier.sourceType === this.entityType
        ? entity.name
        : CustomizedEntity.find(this.view, modifier.sourceType, modifier.sourceId).name;
    const requirements = this.view.rulesetData.requirementsByEntity.get(modifierId) ?? [];
    return {
      ...modifier,
      sourceName,
      requirements: requirements.filter((requirement) => requirement.entityType === this.type),
      targetLabels: TargetLabels.pick([modifier.target, modifier.value], catalog.segmentLabels),
    };
  }

  /** The entity's modifiers of its type, as the view composes them, labeled as a list shows them. */
  describeAll(catalog: TargetPathCatalog) {
    return TargetLabels.describe(catalog, this.rowsOf(this.entity.id));
  }

  /**
   * A new modifier on the entity: the entity as the view has it, and the row it stores, its value checked against
   * its path (`targetPaths`, among `catalogs`). A duplicate (`sourceModifierId`, one of the entity's) takes its
   * source's requirements: refused when it isn't the entity's.
   */
  planCreate(targetPaths: TargetPaths, catalogs: TargetCatalogs, body: ModifierBody, sourceModifierId?: string) {
    const { entity } = this;
    if (sourceModifierId)
      this.findOwn(entity.id, sourceModifierId, `Source ${this.label.toLowerCase()} not found for this entity`);
    const row = ModifierEdits.rowOf(targetPaths, catalogs, this.entityType, body);
    return { bindings: this.bind(targetPaths, row), entity, row };
  }

  /** Deleting one of the entity's modifiers: the entity and the modifier, as the view has them. */
  planDelete(modifierId: string) {
    const { entity } = this;
    return { entity, modifier: this.findOwn(entity.id, modifierId) };
  }

  /**
   * An edit of one of the entity's modifiers: the entity and the modifier, the row it stores, checked, and the bindings
   * of the fields it writes (`planChange`).
   */
  planEdit(targetPaths: TargetPaths, catalogs: TargetCatalogs, modifierId: string, body: ModifierEditBody) {
    const plan = this.planDelete(modifierId);
    const edit = { body, current: plan.modifier };
    const bind = (condition: ModifierBody) => this.bind(targetPaths, condition);
    return { ...plan, ...ModifierEdits.planChange(targetPaths, catalogs, this.entityType, edit, bind) };
  }
}
