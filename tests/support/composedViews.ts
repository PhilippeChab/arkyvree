/** A ruleset's view of a made-up module, composed from rows a test writes: what the view's own tests read. */

import { CowData } from "@/engine/core/cow/index.ts";
import { DeclaredFields } from "@/engine/core/fields/index.ts";
import {
  RulesetComposition,
  type RulesetData,
  type RulesetRawData,
  type ViewEntities,
  type ViewJoins,
  type ViewSchema,
} from "@/engine/core/view/index.ts";
import type { Modifier, Requirement } from "@/shared/relations.ts";

/** A join of the made-up module a test composes a view of, by its name. */
export type Join = keyof ViewJoins;

/** A kind of the made-up module a test composes a view of, by its name. */
export type Kind = keyof ViewEntities;

/** No module's fields: a made-up module's owners hold values of fields none declares, in no order but their own. */
export const NO_FIELDS = new DeclaredFields({}, { fieldDefs: [], linkRoles: [] });

/**
 * A made-up module's declaration: owners and the entities they own, by `ownerId`; owners' links (`owner_links`); and
 * listed entities whose rows nest their links to targets (`links`, each with its target's row, `target`).
 */
export const VIEW_SCHEMA: ViewSchema = {
  kinds: [
    { type: "owners", customizable: false, fields: false, tracked: true, lists: [] },
    { type: "targets", customizable: false, fields: false, tracked: false, lists: [] },
    {
      type: "listed",
      customizable: false,
      fields: false,
      tracked: false,
      lists: [{ name: "links", from: "listedId", target: "target", to: "targetId", toType: "targets" }],
    },
    {
      type: "owned",
      customizable: false,
      owner: { column: "ownerId", position: "position", type: "owners" },
      fields: false,
      tracked: false,
      lists: [],
    },
  ],
  joins: [{ name: "owner_links", from: "owners", fromColumn: "ownerId" }],
};

/**
 * The view of the made-up module a chain composes (`chain`, its own first), by its copy-on-write data's overrides,
 * aliases and siblings, and the fields it declares (`declared`, none by default): its owners labeled "Owner".
 */
export function composeView(
  chain: RulesetRawData[],
  { overrides = [], siblings = [] }: { overrides?: [string, string][]; siblings?: [string, string[]][] } = {},
  declared = NO_FIELDS,
): RulesetData {
  const aliases = [...overrides, ...siblings.flatMap(([winner, losers]) => losers.map((loser) => [loser, winner]))];
  const cow = new CowData(
    ["base"],
    new Map(overrides),
    new Map(aliases as [string, string][]),
    new Map(siblings),
    new Set(),
  );
  return new RulesetComposition(chain, cow, declared, VIEW_SCHEMA, { owners: "Owner" }).build();
}

/** A kind's rows' ids, as a view lists them. */
export function idsOf(view: RulesetData, type: string) {
  return view.rows(type as Kind).map((row) => (row as { id: string }).id);
}

/**
 * A ruleset's own rows of the made-up module: its kinds' and its join's, and a modifier, a field's value and a
 * requirement on each owned entity of `customized`.
 */
export function rawRows(
  entities: Record<string, Record<string, unknown>[]>,
  joins: Record<string, Record<string, unknown>[]> = {},
  customized: string[] = [],
): RulesetRawData {
  return {
    entities: entities as RulesetRawData["entities"],
    joins,
    kindValues: new Map(),
    modifiers: customized.map((sourceId) => ({ id: `m-${sourceId}`, sourceId, sourceType: "owned" }) as Modifier),
    requirements: customized.map(
      (entityId) => ({ id: `r-${entityId}`, entityId, entityType: "owned", level: "1" }) as Requirement,
    ),
    tieredIds: new Set(),
    values: new Map([["owned", new Map(customized.map((id) => [id, { fields: { T: ["v"] }, links: {} }]))]]),
  };
}
