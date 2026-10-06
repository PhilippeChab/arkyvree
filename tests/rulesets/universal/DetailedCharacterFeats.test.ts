import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Feats, Properties } from "@/server/repositories/index.ts";
import DetailedCharacterFeatGroupings from "@/server/rulesets/universal/DetailedCharacterFeatGroupings.ts";
import DetailedCharacterFeats from "@/server/rulesets/universal/DetailedCharacterFeats.ts";
import { FEAT_FAMILY } from "@/shared/dnd3.5/properties/index.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

describe("DetailedCharacterFeats.injectGroupings", () => {
  test("puts a family named like a feat in that feat's entry, and never the feat in itself", async () => {
    const { rulesetId } = await getSeedCtx();
    const generic = (await Feats.findOne(db, { name: "Martial Weapon Proficiency", rulesetId }))!;
    const rapier = (await Feats.findOne(db, { name: "Martial Weapon Proficiency: Rapier", rulesetId }))!;
    const family = await Properties.findMany(db, { entityIds: [rapier.id], entityType: "feats", type: FEAT_FAMILY });
    const feats = new DetailedCharacterFeats();
    feats.initialize([generic, rapier], [rapier]);
    const groupings = new DetailedCharacterFeatGroupings(feats, [FEAT_FAMILY]);
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
