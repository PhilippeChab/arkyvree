import { expect, test } from "bun:test";

import * as RULESET_NAMES from "@/database/packages/dnd35/names.ts";
import { getTargetPathsWithLabels } from "@/server/services/rulesets/customization/targetPaths/index.ts";
import { seededRows } from "@/tests/seeds/seededRows.ts";

// What the seed targets that no path offers yet: the slots of the prestige casters whose spell lists have no spells
// (#206)
const AWAITING = [
  /^aptitudes\.(urpriest|sublimechord|divinecrusader|suelarcanamach|spellthief|consecratedharrier|holyliberator|pioustemplar|templeraiderofolidammara)spells\.\d+\.(uses|allowed)$/,
];

// A target the editor doesn't offer is one an author can't write or save again, and one the engine may not read: a
// Dragon Disciple's boosts on `abilities.strength`, an Ur-priest's slots on `aptitudes.ur-priestspells`
test.each(["modifier", "requirement"] as const)(
  "Every seeded %s targets a path the editor offers, with an operator it offers there",
  async (kind) => {
    const offered = new Map<string, string[]>();
    const seeded: { target: string | null; operator: string | null }[] = [];
    for (const name of Object.values(RULESET_NAMES)) {
      const rows = await seededRows(name);
      for (const path of (await getTargetPathsWithLabels(rows.rulesetId, kind)).paths) {
        offered.set(path.path, path.operators);
      }
      seeded.push(...(kind === "modifier" ? rows.modifiers : rows.requirements));
    }
    const misfits = seeded.filter(
      ({ target, operator }) =>
        target &&
        !AWAITING.some((pattern) => pattern.test(target)) &&
        !(operator && offered.get(target)?.includes(operator)),
    );
    expect([...new Set(misfits.map(({ target, operator }) => `${target} ${operator}`))]).toEqual([]);
  },
);
