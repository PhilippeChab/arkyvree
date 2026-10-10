import { PropertyTypeCatalog } from "@/engine/core/customizations/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { PropertyEntityType } from "@/shared/customization/entities.ts";

import type { Module } from "./Modules.ts";

/** The engine bound to the ruleset's property types and values: the rules' and those its properties use. */
export default class PropertyTypesEngine {
  constructor(
    private readonly view: RulesetView,
    private readonly module: Module,
  ) {}

  /** The ruleset's property types and values: those its rules read, and those its properties use. */
  private catalog() {
    return new PropertyTypeCatalog(this.view.rulesetData, this.module.createPropertyTypes());
  }

  /** The property types an autocomplete offers for `query`: the rules' types, then the ruleset's own, by use. */
  getTypeCompletions(query: string, entityType?: PropertyEntityType) {
    return this.catalog().getTypeCompletions(query, entityType);
  }

  /** The values an autocomplete offers for a property of `type`: the rules' values, then the ruleset's own. */
  getValueCompletions(type: string, query: string) {
    return this.catalog().getValueCompletions(type, query);
  }

  /** The property types containing `query` (all of them for an empty one): the rules' types, then the ruleset's own. */
  list(query: string, entityType?: PropertyEntityType) {
    return this.catalog().list(query, entityType);
  }
}
