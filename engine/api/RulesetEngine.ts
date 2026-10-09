import type { CharacterInput } from "@/engine/core/module/index.ts";
import { type RulesetView, type ViewEntities } from "@/engine/core/view/index.ts";
import type { RulesetKind } from "@/shared/enums.ts";

import AptitudesEngine from "./AptitudesEngine.ts";
import CharacterEngine from "./CharacterEngine.ts";
import CharactersEngine from "./CharactersEngine.ts";
import ClassEngine from "./ClassEngine.ts";
import ClassesEngine from "./ClassesEngine.ts";
import EntityEngine from "./EntityEngine.ts";
import FeatsEngine from "./FeatsEngine.ts";
import ItemsEngine from "./ItemsEngine.ts";
import ModifiersEngine from "./ModifiersEngine.ts";
import Modules, { type Module } from "./Modules.ts";
import PowersEngine from "./PowersEngine.ts";
import PropertiesEngine from "./PropertiesEngine.ts";
import PropertyTypesEngine from "./PropertyTypesEngine.ts";
import RequirementsEngine from "./RequirementsEngine.ts";
import SkillsEngine from "./SkillsEngine.ts";
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

  /** The ruleset's aptitudes. */
  aptitudes() {
    return new AptitudesEngine(this.view, this.module);
  }

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

  /** The ruleset's classes. */
  classes() {
    return new ClassesEngine(this.view, this.module);
  }

  /**
   * Rows of the ruleset's tables, as stored (a page the server read), as its view reads them: each reference to an
   * entity resolved to the one the view shows in its place, a copy's or a sibling winner's.
   */
  describeRows<T extends Record<string, unknown>>(rows: T[]) {
    return this.view.rulesetData.cow.resolveRows(rows);
  }

  /** An entity of the ruleset's view, of its table (`type`) and its id. */
  entity<K extends keyof ViewEntities>(type: K, id: string) {
    return new EntityEngine(this.view, type, id);
  }

  /** The ruleset's feats. */
  feats() {
    return new FeatsEngine(this.view, this.module);
  }

  /** The ruleset's items. */
  items() {
    return new ItemsEngine(this.view, this.module);
  }

  /** An entity's modifiers (`entityType`, `entityId`). */
  modifiers(entityType: string, entityId: string) {
    return new ModifiersEngine(this.view, this.module, entityType, entityId);
  }

  /** The ruleset's powers. */
  powers() {
    return new PowersEngine(this.view, this.module);
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

  /** The ruleset's skills. */
  skills() {
    return new SkillsEngine(this.view, this.module);
  }

  /** The ruleset's target paths. */
  targetPaths() {
    return new TargetPathsEngine(this.view, this.module);
  }
}
