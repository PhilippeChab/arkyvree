import type { RulesetData } from "@/server/cache/rulesetCache/index.ts";
import type { Holders, TraversePathResult } from "@/server/rulesets/engine/types.ts";
import type { TargetPath } from "@/shared/customization/target.ts";

import type PathTraverser from "./PathTraverser.ts";

/** A category of target paths (`abilities`, `skills`…): its names, and how a path in it reaches its data. */
export interface PathCategory {
  /** A path's first element */
  name: string;
  /** Its name in the path picker */
  label: string;
  description: string;
  /** The component its data comes from, and the getter that hands it to a path: none when its paths resolve their own way */
  holder?: { key: string; getter: string };
  /** Whether an entry's name also reaches the entries its name starts: a skill's subtypes */
  expandsSubtypes?: true;
  /** A group of its paths' description (`abilities`, `items.weapons`), `{name}` the group's label */
  groupDescriptionTemplates?: Record<string, string>;
  /** A path prefix's description (`combat.ac`) */
  pathDescriptions?: Record<string, string>;
  /** Its target paths a modifier or a requirement may name, for the ruleset's data */
  generate?(rulesetData: RulesetData, kind: "modifier" | "requirement"): TargetPath[];
  /** Its paths' own segments' labels (`base`, `misc`…), before the ruleset's names */
  getSegmentLabels?(): Record<string, string>;
  /** Whether a target reads its source itself (an item's own weapon: the place its item is held), not the sheet */
  readsSource?(target: string): boolean;
  /** A target it resolves its own way, or null for the walk from its holder's data */
  resolve?(
    target: string,
    rest: string[],
    holders: Holders,
    traverser: PathTraverser,
    context?: { sourceId?: string },
  ): TraversePathResult[] | null;
}
