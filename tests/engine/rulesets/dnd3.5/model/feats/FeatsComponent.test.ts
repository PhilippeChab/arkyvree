import { describe, expect, test } from "bun:test";

import FeatGroupingsComponent from "@/engine/rulesets/dnd3.5/model/feats/FeatGroupingsComponent.ts";
import FeatsComponent from "@/engine/rulesets/dnd3.5/model/feats/FeatsComponent.ts";
import CustomizedEntities from "@/engine/rulesets/dnd3.5/model/loading/CustomizedEntities.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Properties, Rulesets } from "@/server/repositories/index.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { FEAT_FAMILY } from "@/vocabulary/dnd3.5/properties/index.ts";

describe("FeatsComponent.injectGroupings", () => {
  test("puts a family named like a feat in that feat's entry, and never the feat in itself", async () => {
    const { rulesetId } = await getSeedCtx();
    const ruleset = (await Rulesets.findOne(db, { id: rulesetId }))!;
    const rulesetData = await RulesetViews.getData(ruleset);
    const named = (name: string) => rulesetData.feats.find((feat) => feat.name === name)!;
    const generic = named("Martial Weapon Proficiency");
    const rapier = named("Martial Weapon Proficiency: Rapier");
    const family = await Properties.findMany(db, { entityIds: [rapier.id], entityType: "feats", type: FEAT_FAMILY });
    const feats = new FeatsComponent();
    // The character holds the rapier's
    feats.initialize({ feats: [CustomizedEntities.toVirtualFeat(rapier, rulesetData)] }, { ruleset, rulesetData });
    const groupings = new FeatGroupingsComponent(feats);
    // The feat in its own family too, as a ruleset could tag it
    for (const feat of [generic, rapier]) groupings.registerFeat(feat, family);
    feats.injectGroupings(groupings.getFeatGroupings());

    const rapierEntry = { name: "Martial Weapon Proficiency: Rapier", possessed: true, count: 1 };
    // A sheet's feats are sent as they are: an entry holding itself couldn't be
    const { martialweaponproficiency, martialweaponproficiencyrapier } = JSON.parse(JSON.stringify(feats.getFeats()));
    expect({ martialweaponproficiency, martialweaponproficiencyrapier }).toEqual({
      martialweaponproficiency: { name: "Martial Weapon Proficiency", possessed: false, count: 0, rapier: rapierEntry },
      martialweaponproficiencyrapier: rapierEntry,
    });
    expect(feats.getFeat("Martial Weapon Proficiency")?.possessed).toBe(false);
  });
});
