import type {
  EntityAction,
  EntityLinks,
  EntityProgression,
  EntityTables,
  OwnedEntities,
} from "@/engine/core/entities/index.ts";
import type { EntityFieldValues, FormField } from "@/engine/core/fields/index.ts";
import type { CharacterInput } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { RulesetKind } from "@/shared/enums.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

import CharacterEngine from "./CharacterEngine.ts";
import CharactersEngine from "./CharactersEngine.ts";
import ModifiersEngine from "./ModifiersEngine.ts";
import Modules, { type Accepted, type EntityKinds, type EntityType, type Module } from "./Modules.ts";
import RequirementsEngine from "./RequirementsEngine.ts";
import StorageEngine from "./StorageEngine.ts";
import TargetPathsEngine from "./TargetPathsEngine.ts";

/**
 * A part of an entity a kind may have, by its method: the entities it owns, one of them by its id alone, the links it
 * edits, its progression and its tables.
 */
type EntityPart = "describeOwned" | "links" | "owned" | "progression" | "tables";

/**
 * What a kind (`T`, its rules) answers of a part (`P`), if it has it: none of a kind that hasn't, of each of a union.
 */
type PartOf<T, P extends EntityPart> = T extends Record<P, (id: string) => infer R> ? R : never;

/** What a progression's save sends, as each registered kind that has one takes it (a class's levels' forms…). */
export type ProgressionForm = Accepted<ReturnType<RulesetEngine["progression"]>["plan"]>[0];

/** What a refusal calls a part a kind has none of: "No links for races". */
const PART_WORDS: Readonly<Record<EntityPart, string>> = {
  describeOwned: "owned entities",
  links: "links",
  owned: "owned entities",
  progression: "progression",
  tables: "tables",
};

/**
 * The engine bound to a ruleset's view (`Engine.for(scope)`): what its rules answer, by what they're about, each a
 * handle bound to it (a character's rows, an entity kind, an entity's customizations). Its module, which its base rules
 * pick, is read once.
 */
export default class RulesetEngine {
  constructor(private readonly view: RulesetView) {
    this.module = Modules.of(view.ruleset.baseRules);
  }

  private readonly module: Module;

  /**
   * A part of an entity of a kind (`type`, `ownerId`), by its method (`part`): refused as not found when its kind has
   * none of it ("No links for races").
   */
  private part<K extends EntityType, P extends EntityPart>(type: K, part: P, id: string): PartOf<EntityKinds[K], P> {
    const kind = this.entities(type) as unknown as Partial<Record<P, (id: string) => PartOf<EntityKinds[K], P>>>;
    const method = kind[part];
    if (typeof method !== "function")
      throw new RulesError("not-found", `No ${PART_WORDS[part]} for ${getUrlSegment(type)}`);
    return method.call(kind, id);
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
    this.module.ruleset.checkPublishable(this.view, kind);
  }

  /**
   * The fields each entity's form shows, by its type, and the ruleset's Settings' (`rulesets`), as the ruleset declares
   * them: what a form lays out and what its save holds each to.
   */
  describeFields(): Record<string, FormField[]> {
    const ownerOf = new Map(
      StorageEngine.shared()
        .registries()
        .entityTypes.map(({ ownerType, type }) => [type, ownerType]),
    );
    const fieldsOf = (type: string) => {
      if (type === "rulesets") return this.module.ruleset.describeSettingsFields();
      const owner = ownerOf.get(type);
      return owner
        ? this.entities(owner as EntityType).describeOwnedFields(type)
        : this.entities(type as EntityType).describeFields();
    };
    return Object.fromEntries(
      StorageEngine.shared()
        .propertyTypes()
        .toSorted()
        .map((type) => [type, fieldsOf(type)]),
    );
  }

  /**
   * An owned entity by its id alone (`type`, its owner's kind; `ownedId`), as its page shows it, with its owner's name.
   */
  describeOwned<K extends EntityType>(type: K, ownedId: string) {
    return this.part(type, "describeOwned", ownedId);
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

  /** An entity's links it edits through a join (`type`, `ownerId`: a class's skills): refused for a kind without. */
  links<K extends EntityType>(type: K, ownerId: string) {
    return this.part(type, "links", ownerId) as Extract<PartOf<EntityKinds[K], "links">, EntityLinks>;
  }

  /** An entity's modifiers (`entityType`, `entityId`). */
  modifiers(entityType: string, entityId: string) {
    return new ModifiersEngine(this.view, this.module, entityType, entityId);
  }

  /** The entities an entity owns (`type`, `ownerId`: a class's levels): refused for a kind that owns none. */
  owned<K extends EntityType>(type: K, ownerId: string) {
    return this.part(type, "owned", ownerId) as Extract<PartOf<EntityKinds[K], "owned">, OwnedEntities>;
  }

  /** A save of the ruleset's Settings (`body.fields`): checked, the values it keeps, and the properties it writes. */
  planSettings(body: { fields?: EntityFieldValues }) {
    return this.module.ruleset.planSettings(this.view, body);
  }

  /** An entity's progression (`type`, `ownerId`: a class's levels at once): refused for a kind without one. */
  progression<K extends EntityType>(type: K, ownerId: string) {
    return this.part(type, "progression", ownerId) as Extract<PartOf<EntityKinds[K], "progression">, EntityProgression>;
  }

  /** An entity's requirements (`entityType`, `entityId`). */
  requirements(entityType: string, entityId: string) {
    return new RequirementsEngine(this.view, this.module, entityType, entityId);
  }

  /** An entity's tables (`type`, `ownerId`: a class's spells per day): refused for a kind without them. */
  tables<K extends EntityType>(type: K, ownerId: string) {
    return this.part(type, "tables", ownerId) as Extract<PartOf<EntityKinds[K], "tables">, EntityTables>;
  }

  /** The ruleset's target paths. */
  targetPaths() {
    return new TargetPathsEngine(this.view, this.module);
  }
}
