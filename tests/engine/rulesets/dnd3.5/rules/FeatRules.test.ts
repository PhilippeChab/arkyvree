import { describe, expect, test } from "bun:test";

import FeatRules from "@/engine/rulesets/dnd3.5/rules/FeatRules.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

/** The seeded ruleset's feat rules, and its feats' ids by name. */
async function seededRules() {
  const { rulesetId } = await getSeedCtx();
  const data = await RulesetViews.getData((await Rulesets.findOne(db, { id: rulesetId }))!);
  const idOf = (name: string) => Dnd35View.of(data).feats.find((feat) => feat.name === name)!.id;
  return { idOf, rules: FeatRules.of(data) };
}

describe("a feat a character takes", () => {
  test("stacks as its flag says, and a feat the ruleset hasn't doesn't", async () => {
    const { idOf, rules } = await seededRules();
    expect(rules.isStackable(idOf("Toughness"))).toBe(true);
    expect(rules.isStackable(idOf("Power Attack"))).toBe(false);
    expect(rules.isStackable("00000000-0000-0000-0000-000000000000")).toBe(false);
  });

  test("is taken again when it stacks, and once when it doesn't", async () => {
    const { idOf, rules } = await seededRules();
    const [toughness, powerAttack] = [idOf("Toughness"), idOf("Power Attack")];
    const none = new Set<string>();
    const held = new Set([toughness, powerAttack]);
    expect(rules.canTake(toughness, none)).toBe(true);
    expect(rules.canTake(powerAttack, none)).toBe(true);
    expect(rules.canTake(toughness, held)).toBe(true);
    expect(rules.canTake(powerAttack, held)).toBe(false);
  });
});
