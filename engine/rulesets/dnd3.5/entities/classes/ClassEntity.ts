/** A class as a ruleset's entity: its fields, and what its save stores. */

import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

import { CLASS_FIELDS } from "./fields.ts";

/** A class as the ruleset describes it, and what its save stores. */
export default class ClassEntity {
  /**
   * A class with its fields, and the ids of the properties that keep them, which its page edits them through: the
   * ability its bonus spells use, and the spells it casts.
   */
  static describe(view: RulesetView, klassId: string) {
    const klass = ClassEntity.find(view, klassId);
    const properties = view.rulesetData.propertiesByEntity.get(klass.id) ?? [];
    const { bonusSpellAbilityId, casterType } = CLASS_FIELDS.read(properties);
    const propertyIds = CLASS_FIELDS.readIds(properties);
    return {
      ...klass,
      bonusSpellAbilityId,
      bonusSpellPropertyId: propertyIds.bonusSpellAbilityId,
      casterTypeValue: casterType,
      casterTypePropertyId: propertyIds.casterType,
    };
  }

  /** A class as the view has it: refused when there's none of its id. */
  static find(view: RulesetView, klassId: string) {
    const klass = view.rulesetData.find("klasses", klassId);
    if (!klass) throw new RulesError("not-found", "Class not found in this ruleset");
    return klass;
  }

  /** A new class's row, from its form: its hit die 8 when the form gives none. */
  static planCreate(_view: RulesetView, body: { description?: string | null; hd?: number; name: string }) {
    return { columns: { ...body, hd: body.hd || 8 } };
  }
}
