import { expect, test } from "bun:test";

import * as RULESET_NAMES from "@/database/packages/dnd35/names.ts";
import { getTargetPathsWithLabels } from "@/server/services/rulesets/customization/targetPaths/index.ts";
import { seededRows } from "@/tests/seeds/seededRows.ts";

// What the seed targets that no path offers yet: the slots of the prestige casters whose spell lists have no spells,
// the divine crusader's and the temple raider's (#232)
const AWAITING = [/^aptitudes\.(divinecrusader|templeraiderofolidammara)spells\.\d+\.(uses|allowed)$/];

// A target the editor doesn't offer is one an author can't write or save again, and one the engine may not read: a
// Dragon Disciple's boosts on `abilities.strength`, an Ur-priest's slots on `aptitudes.ur-priestspells`
test.each(["modifier", "requirement"] as const)(
  "Every seeded %s targets a path the editor offers, with an operator it offers there",
  async (kind) => {
    // Each ruleset's rows against its own paths: an extension's compose the core rules', not the other way round
    const misfits: string[] = [];
    for (const name of Object.values(RULESET_NAMES)) {
      const rows = await seededRows(name);
      const offered = new Map(
        (await getTargetPathsWithLabels(rows.rulesetId, kind)).paths.map((path) => [path.path, path.operators]),
      );
      for (const { target, operator } of kind === "modifier" ? rows.modifiers : rows.requirements) {
        if (!target || AWAITING.some((pattern) => pattern.test(target))) continue;
        if (!(operator && offered.get(target)?.includes(operator))) misfits.push(`${name}: ${target} ${operator}`);
      }
    }
    expect([...new Set(misfits)]).toEqual([]);
  },
);
