import type { RulesetData } from "@/engine/core/view/index.ts";
import type { TargetPath } from "@/shared/customization/target.ts";

import type { Components, TraversePathResult } from "./PathTraverser.ts";
import type PathTraverser from "./PathTraverser.ts";

/** A category's labels of the ruleset's own names: those over any other label, and those that only fill a gap. */
type CategoryLabelNames = { fallbacks?: Record<string, string>; names?: Record<string, string> };

/** A component of `C`, by its key, and the getter that hands its data to a path: both checked against `C`. */
type ComponentSpec<C> = { [K in keyof C & string]: { getter: GetterOf<C[K]>; key: K } }[keyof C & string];

/** The names of `T`'s methods a path can call without arguments: the getters its data comes from. */
export type GetterOf<T> = { [M in keyof T]-?: T[M] extends () => unknown ? M : never }[keyof T] & string;

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
  generate?(rulesetData: RulesetData, kind: "modifier" | "requirement"): TargetPath[];
  /** Its paths' own segments' labels (`base`, `misc`…), before the ruleset's names */
  getSegmentLabels?(): Record<string, string>;
  /** A group of its paths' description (`abilities`, `items.weapons`), `{name}` the group's label */
  groupDescriptionTemplates?: Record<string, string>;
  /** Its name in the path picker */
  label: string;
  /**
   * The labels of the ruleset's own names in its paths (its entities', its properties' values): `names` label their
   * segment over any other label, `fallbacks` only one no other label names
   */
  labelNames?(rulesetData: RulesetData): CategoryLabelNames;
  /** A path's first element */
  name: string;
  /**
   * Whether its paths name an entity under their group (`items.weapons.<item>.…`): a path's description and its group's
   * template skip the entity's segment
   */
  namesEntities?: true;
  /** A path prefix's description (`combat.ac`) */
  pathDescriptions?: Record<string, string>;
  /** Whether a target reads its source itself (an item's own weapon: the place its item is held), not the sheet */
  readsSource?(target: string): boolean;
  /** A target it resolves its own way, or null for the walk from its component's data */
  resolve?(
    target: string,
    rest: string[],
    components: Components,
    traverser: PathTraverser,
    context?: { sourceId?: string },
  ): TraversePathResult[] | null;
}
