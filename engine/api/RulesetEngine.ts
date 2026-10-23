import type { EntityAction } from "@/engine/core/entities/index.ts";
import type { EntityFieldValues, FormField } from "@/engine/core/fields/index.ts";
import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { PropertyEntityType } from "@/shared/customization/entities.ts";
import type { RulesetKind } from "@/shared/enums.ts";

import CharacterEngine from "./CharacterEngine.ts";
import CharactersEngine from "./CharactersEngine.ts";
import ClassEngine from "./ClassEngine.ts";
import ModifiersEngine from "./ModifiersEngine.ts";
import Modules, { type EntityType, type Module } from "./Modules.ts";
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
    this.module.ruleset.checkPublishable(this.view, kind);
  }

  /** A class of the ruleset (`klassId`): its table, its levels and its skills. */
  class(klassId: string) {
    return new ClassEngine(this.view, this.module, klassId);
  }

  /**
   * The fields each entity's form shows, by its type, and the ruleset's Settings' (`rulesets`), as the ruleset declares
   * them: what a form lays out and what its save holds each to.
   */
  describeFields(): Record<PropertyEntityType, FormField[]> {
    return {
      feats: this.entities("feats").describeFields(),
      items: this.entities("items").describeFields(),
      klass_levels: this.entities("klasses").describeLevelFields(),
      klasses: this.entities("klasses").describeFields(),
      powers: this.entities("powers").describeFields(),
      races: this.entities("races").describeFields(),
      rulesets: this.module.ruleset.describeSettingsFields(),
      skills: this.entities("skills").describeFields(),
    };
  }

  /** The ruleset's Settings, its own fields (3.5's skill points' ability), as its chain composes them. */
  describeSettings() {
    return this.module.ruleset.describeSettings(this.view);
  }

  /**
   * An entity kind of the ruleset (`type`, its table): one found by its id and described, a page of its rows opened
   * (`openList`), and what saving or deleting one writes, by its kind's rules. Opened for an action it may have none of
   * (`action`: an ability's create, a race's templates), refused as not found when it has none.
   */
  entities<K extends EntityType>(type: K, action?: EntityAction) {
    const kind = this.module.entities.of(this.view, type);
    if (action) kind.checkAction(action);
    return kind;
  }

  /** An entity's modifiers (`entityType`, `entityId`). */
  modifiers(entityType: string, entityId: string) {
    return new ModifiersEngine(this.view, this.module, entityType, entityId);
  }

  /** A save of the ruleset's Settings (`body.fields`): checked, the values it keeps, and the properties it writes. */
  planSettings(body: { fields?: EntityFieldValues }) {
    return this.module.ruleset.planSettings(this.view, body);
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
