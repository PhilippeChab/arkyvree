import { describe, expect, test } from "bun:test";

import FeatGroupingsComponent from "@/engine/rulesets/dnd3.5/model/feats/FeatGroupingsComponent.ts";
import FeatsComponent from "@/engine/rulesets/dnd3.5/model/feats/FeatsComponent.ts";
import { db } from "@/server/database/index.ts";
import { Feats, Properties } from "@/server/repositories/index.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { FEAT_FAMILY } from "@/vocabulary/dnd3.5/properties/index.ts";

describe("FeatsComponent.injectGroupings", () => {
  test("puts a family named like a feat in that feat's entry, and never the feat in itself", async () => {
    const { rulesetId } = await getSeedCtx();
    const generic = (await Feats.findOne(db, { name: "Martial Weapon Proficiency", rulesetId }))!;
    const rapier = (await Feats.findOne(db, { name: "Martial Weapon Proficiency: Rapier", rulesetId }))!;
    const family = await Properties.findMany(db, { entityIds: [rapier.id], entityType: "feats", type: FEAT_FAMILY });
    const feats = new FeatsComponent();
    feats.initialize([generic, rapier], [rapier]);
    const groupings = new FeatGroupingsComponent(feats);
    // The feat in its own family too, as a ruleset could tag it
    for (const feat of [generic, rapier]) groupings.registerFeat(feat, family);
    feats.injectGroupings(groupings.getFeatGroupings());

    const rapierEntry = { name: "Martial Weapon Proficiency: Rapier", possessed: true, count: 1 };
    // A sheet's feats are sent as they are: an entry holding itself couldn't be
    expect(JSON.parse(JSON.stringify(feats.getFeats()))).toEqual({
      martialweaponproficiency: { name: "Martial Weapon Proficiency", possessed: false, count: 0, rapier: rapierEntry },
      martialweaponproficiencyrapier: rapierEntry,
    });
    expect(feats.getFeat("Martial Weapon Proficiency")?.possessed).toBe(false);
  });
});
