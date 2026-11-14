import type { RulesetData } from "@/engine/core/view/index.ts";
import type { OperatorKind, TargetPath } from "@/shared/customization/target.ts";

import type { Components, TraversePathResult } from "./PathTraverser.ts";
import type PathTraverser from "./PathTraverser.ts";

/** A category's labels of the ruleset's own names: those over any other label, and those that only fill a gap. */
interface CategoryLabelNames {
  fallbacks?: Record<string, string>;
  names?: Record<string, string>;
}

/** A component of `C`, by its key, and the getter that hands its data to a path: both checked against `C`. */
type ComponentSpec<C> = { [K in keyof C & string]: { getter: GetterOf<C[K]>; key: K } }[keyof C & string];

/**
 * A segment of a path that names an entity: its place, its entities' kind, and how their name is written there when
 * not as its plain slug (a spell list's short name).
 */
export interface NamedSegment {
  entityType: string;
  segment: number;
  slugOf?(name: string): string;
}

/** What a value names: its entities' kind, and their partition when the kind has several (a race's). */
export interface NamedValue {
  entityType: string;
  partition?: string;
}

/**
 * A category of target paths (`abilities`, `skills`…): its names, and how a path in it reaches its data in the
 * components `C`.
 */
export interface PathCategory<C = Components> {
  /** The component its data comes from, and the getter that hands it to a path: none when its paths resolve their own way */
  component?: ComponentSpec<C>;
  description: string;
  /** Whether an entry's name also reaches the entries its name starts: a skill's subtypes */
  expandsSubtypes?: true;
  /** Its target paths a modifier or a requirement may name, for the ruleset's data */
  generate?(rulesetData: RulesetData, kind: OperatorKind): TargetPath[];
  /** Its paths' own segments' labels (`base`, `misc`…), before the ruleset's names */
  getSegmentLabels?(): Record<string, string>;
  /**
   * The leaf a modifier sets true to grant the entity its path names, and that entity's kind as a message names it
   * (3.5's feats: `possessed`, "feat"). Such a modifier names one entity and sets a literal (`CategoryPaths.findGrantError`),
   * which the modifier catalog marks (`literalOnly`)
   */
  grants?: { entity: string; leaf: string };
  /** A group of its paths' description (`abilities`, `items.weapons`), `{name}` the group's label */
  groupDescriptionTemplates?: Record<string, string>;
  /** Its name in the path picker */
  label: string;
  /**
   * The labels of the ruleset's own names in its paths (its entities', its fields' values): `names` label their
   * segment over any other label, `fallbacks` only one no other label names
   */
  labelNames?(rulesetData: RulesetData): CategoryLabelNames;
  /** A path's first element */
  name: string;
  /**
   * The kind of the entities its paths' second segment names (`feats.<feat>.possessed`: `feats`): a save keeps which
   * entity each such name means, beside the path's text (`NameBinder`), but for the words its paths use there themselves
   * (`fixed`: a skill's `budget`), which name none. None for a category that names none there
   */
  names?: { entityType: string; fixed?: readonly string[] };
  /**
   * Which of a path's segments (`segments`) name entities, for a category whose paths name more than one or spell a
   * name its own way (a spell's: the spell, and the list it's known on, by the list's short name), in place of `names`
   */
  nameSegments?(segments: readonly string[]): NamedSegment[];
  /**
   * Whether its paths name an entity under their group (`items.weapons.<item>.…`): a path's description and its group's
   * template skip the entity's segment
   */
  namesEntities?: true;
  /** A path prefix's description (`combat.ac`) */
  pathDescriptions?: Record<string, string>;
  /** Whether a target reads its source itself (an item's own weapon: the place its item is held), not the sheet */
  readsSource?(target: string): boolean;
  /** A target it resolves its own way, in its `context` (its source, its scope), or null for the walk from its component's data */
  resolve?(
    target: string,
    rest: string[],
    components: Components,
    traverser: PathTraverser,
    context?: PathContext,
  ): TraversePathResult[] | null;
  /**
   * The kinds whose entities `nameSegments` names in its paths' segments (3.5's spells': the spell and its list), which
   * a category that gives it declares: what tells the kinds whose names a path spells (`CategoryPaths.namedKinds`)
   */
  segmentKinds?: readonly string[];
  /**
   * The kind of entity a value on one of its paths names (`path`: a race's name, of the player's races or a bonded
   * kind's), which a save keeps as it keeps a path's names. None for a path whose value names none
   */
  valueNames?(path: string): NamedValue | undefined;
}

/**
 * What a path is read for, past the sheet itself: the item it's of (`sourceId`), whose own weapon its paths reach, and
 * the part of the sheet it reads (`scope`, a ruleset's own: 3.5's weapon sets). A category whose values differ by scope
 * resolves them (`PathCategory.resolve`); without one, a path reads the sheet.
 */
export interface PathContext {
  scope?: string;
  sourceId?: string;
}

/** The names of `T`'s methods a path can call without arguments: the getters its data comes from. */
export type GetterOf<T> = { [M in keyof T]-?: T[M] extends () => unknown ? M : never }[keyof T] & string;
