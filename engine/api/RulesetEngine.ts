import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { RulesetKind } from "@/shared/enums.ts";

import CharacterEngine from "./CharacterEngine.ts";
import CharactersEngine from "./CharactersEngine.ts";
import ClassEngine from "./ClassEngine.ts";
import ModifiersEngine from "./ModifiersEngine.ts";
import Modules, { type EntityType, type Module } from "./Modules.ts";
import PropertiesEngine from "./PropertiesEngine.ts";
import PropertyTypesEngine from "./PropertyTypesEngine.ts";
import RequirementsEngine from "./RequirementsEngine.ts";
import TargetPathsEngine from "./TargetPathsEngine.ts";

/**
 * The engine bound to a ruleset's view (`Engine.for(scope)`): what its rules answer, by what they're about, each a
 * handle bound to it (a character's rows, a class, an entity's customizations). Its module, which its base rules pick,
 * is read once.
 */
export default class RulesetEngine {
  constructor(private readonly view: RulesetView) {
    this.module = Modules.of(view.ruleset.baseRules);
  }

  private readonly module: Module;

  /** A character of the ruleset, from its rows (`input`): its sheets, its inventory and its level flows. */
  character(input: CharacterInput) {
    return new CharacterEngine(this.view, this.module, input);
  }

  /** The ruleset's characters, read or new: what needs no character's rows. */
  characters() {
    return new CharactersEngine(this.view, this.module);
  }

  /**
   * Refuses publishing the ruleset as `kind` while it lacks what its rules make a character of: an extension, an add-on
   * to rulesets that have it, needs none.
   */
  checkPublishable(kind: RulesetKind) {
    if (kind !== "extension") this.module.entities.checkPlayable(this.view);
  }

  /** A class of the ruleset (`klassId`): its table, its levels and its skills. */
  class(klassId: string) {
    return new ClassEngine(this.view, this.module, klassId);
  }

  /**
   * An entity kind of the ruleset (`type`, its table): one found by its id, described, a page of its rows described, and
   * what saving or deleting one writes, by its kind's rules.
   */
  entities<K extends EntityType>(type: K) {
    return this.module.entities.of(this.view, type);
  }

  /** An entity's modifiers (`entityType`, `entityId`). */
  modifiers(entityType: string, entityId: string) {
    return new ModifiersEngine(this.view, this.module, entityType, entityId);
  }

  /** An entity's properties (`entityType`, `entityId`). */
  properties(entityType: string, entityId: string) {
    return new PropertiesEngine(this.view, entityType, entityId);
  }

  /** The ruleset's property types and values. */
  propertyTypes() {
    return new PropertyTypesEngine(this.view, this.module);
  }

  /** An entity's requirements (`entityType`, `entityId`). */
  requirements(entityType: string, entityId: string) {
    return new RequirementsEngine(this.view, this.module, entityType, entityId);
  }

  /** The ruleset's target paths. */
  targetPaths() {
    return new TargetPathsEngine(this.view, this.module);
  }
}
