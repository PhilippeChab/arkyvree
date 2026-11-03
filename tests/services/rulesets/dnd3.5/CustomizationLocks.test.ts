import { afterEach, expect, test } from "bun:test";

import type { Feat } from "@/engine/rulesets/dnd3.5/index.ts";
import { RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, Modifiers, Requirements } from "@/server/repositories/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";
import { bumpContentVersion, createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";

/**
 * A feat's modifier and requirement, the ruleset's view cached, then both removed by another write (its content version
 * bumped, as its lock leaves it): what a client that read them before sends.
 */
async function setupRemovedCustomizations() {
  const session = makeSession();
  const ruleset = await createSeededTestRuleset(session.userId);
  const [feat] = await Entities.create<Feat>(db, "feats", { name: "Removed Customizations", rulesetId: ruleset.id });
  const owner = { entityId: feat.id, entityType: "feats" };
  const [modifier] = await Modifiers.createMany(db, [
    {
      target: "abilities.strength.misc",
      value: "1",
      operator: "add",
      valueType: "number",
      sourceId: feat.id,
      sourceType: "feats",
    },
  ]);
  const [requirement] = await Requirements.createMany(db, [
    { ...owner, level: "1", target: "combat.bab", operator: "greater_than_or_equal", value: "1", valueType: "number" },
  ]);
  await withRulesetScope(db, ruleset.id, async () => {});
  await Modifiers.delete(db, { ids: [modifier.id] });
  await Requirements.delete(db, { ids: [requirement.id] });
  await bumpContentVersion(ruleset.id);
  return { session, rulesetId: ruleset.id, featId: feat.id, modifier, requirement };
}
afterEach(() => RulesetViews.invalidateAll());
test("every customization kind refuses one another write removed as missing", async () => {
  const { session, rulesetId, featId, modifier, requirement } = await setupRemovedCustomizations();
  const mutations = [
    () =>
      ModifiersService.updateModifier(session, rulesetId, "feats", featId, modifier.id, {
        target: modifier.target,
        value: "2",
        operator: "add",
      }),
    () => ModifiersService.deleteModifier(session, rulesetId, "feats", featId, modifier.id),
    () => RequirementsService.updateRequirement(session, rulesetId, "feats", featId, requirement.id, { level: "1" }),
    () => RequirementsService.deleteRequirement(session, rulesetId, "feats", featId, requirement.id),
  ];
  // The view shows neither: the engine refuses each as not found
  for (const mutate of mutations) expect(mutate()).rejects.toMatchObject({ refusal: "not-found" });
});
