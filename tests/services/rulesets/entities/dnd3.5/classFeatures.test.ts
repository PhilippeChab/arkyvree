import { describe, expect, test } from "bun:test";

import type { Aptitude, Feat, Klass } from "@/engine/rulesets/dnd3.5/index.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, EntityLinks } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { findFormValues } from "@/tests/support/ownerValues.ts";
import {
  createSeededTestRuleset,
  createSeededTestRulesetWithExtensions,
  ownerSessionOf,
} from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";
import { FEAT_SELECTABLE, FEAT_STACKABLE } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A pool as a progression's answer names it. */
interface PoolRef {
  id: string;
  name: string;
}

/** The seed user's fork of the seeded rules with their extensions, and one of its inherited classes. */
async function forkWithClass(name: string) {
  const session = makeSession();
  const fork = await createSeededTestRulesetWithExtensions(session.userId);
  const klass = (await Entities.findOne<Klass>(db, { entityType: "classes", name, rulesetId: fork.rulesetId! }))!;
  return { session, fork, klass };
}

/** The names of the feats a search finds among those a class may grant as its features. */
async function grantable(rulesetId: string, classId: string, search: string) {
  return (await grantableRows(rulesetId, classId, search)).map((feat) => feat.name);
}

/** The feats a search of the ruleset's list finds among those a class may grant as its features, as listed. */
async function grantableRows(rulesetId: string, classId: string, search: string) {
  const page = await EntitiesService.getEntities(
    await ownerSessionOf(rulesetId),
    rulesetId,
    "feats",
    { grantableBy: classId, search },
    { limit: 50, page: 1 },
  );
  return page.items as unknown as { grantedThrough: PoolRef[]; name: string; stacks: boolean }[];
}

/** The feature a typed name creates on a class, as its picker offers it. */
async function newFeature(rulesetId: string, classId: string, name: string) {
  return await EntitiesService.getNewFeature(await ownerSessionOf(rulesetId), rulesetId, "classes", classId, name);
}

/** What a class's Progression tab offers, as its progression's answer gives it. */
async function readOffers(rulesetId: string, classId: string) {
  const answer = (await EntitiesService.getProgression(
    await ownerSessionOf(rulesetId),
    rulesetId,
    "classes",
    classId,
  )) as {
    featurePools: PoolRef[];
    offeredPools: PoolRef[];
    ownFeaturePool: { featureName: string; id: string | null; name: string };
  };
  return {
    featurePools: answer.featurePools.map((pool) => pool.name),
    offeredPools: answer.offeredPools.map((pool) => pool.name),
    ownFeaturePool: answer.ownFeaturePool,
  };
}

describe("EntitiesService: a class's features and feat pools", () => {
  test("offer the cleric every feat pool but a class's own features, its own first", async () => {
    const { fork, klass } = await forkWithClass("Cleric");
    const offers = await readOffers(fork.id, klass.id);

    expect(offers.offeredPools[0]).toBe("Cleric Domain");
    expect(offers.offeredPools).toEqual(expect.arrayContaining(["General", "Fighter Bonus Feat", "Wizard Bonus Feat"]));
    // A class's feature pool holds the features its levels grant outright, which no pick chooses: its own too
    expect(offers.offeredPools).not.toContain("Cleric Class Feature");
    expect(offers.offeredPools).not.toContain("Fighter Class Feature");
    expect(offers.offeredPools).not.toContain("Monk Class Feature");
    expect(offers.featurePools[0]).toBe("Cleric Class Feature");
    expect(offers.featurePools).toContain("General");
    expect(offers.featurePools).not.toContain("Monk Class Feature");
    expect(offers.ownFeaturePool).toMatchObject({ featureName: "{name} (Cleric)", name: "Cleric Class Feature" });
  });

  // In the core rules alone, the fighter is the one class giving picks in Fighter Bonus Feat: any class may still
  test("offer a class of the core rules alone the fighter's bonus feats", async () => {
    const session = makeSession();
    const fork = await createSeededTestRuleset(session.userId);
    const cleric = (await Entities.findOne<Klass>(db, {
      entityType: "classes",
      name: "Cleric",
      rulesetId: fork.rulesetId!,
    }))!;

    expect((await readOffers(fork.id, cleric.id)).offeredPools).toContain("Fighter Bonus Feat");
  });

  test("list the feats a class may grant as its features: its own first, then General's, each with its pools", async () => {
    const { fork, klass } = await forkWithClass("Cleric");
    const all = await grantableRows(fork.id, klass.id, "");
    const own = all.filter((feat) => feat.name.endsWith(" (Cleric)"));

    // Its own come first, granted through its own feature pool, none Stackable
    expect(all.slice(0, own.length)).toEqual(own);
    expect(own.map((feat) => feat.name)).toContain("Aura (Cleric)");
    expect(own[0]).toMatchObject({ grantedThrough: [{ name: "Cleric Class Feature" }], stacks: false });
    // The others by name after them: Improved Toughness, then Toughness
    const toughness = (await grantableRows(fork.id, klass.id, "Toughness")).find((feat) => feat.name === "Toughness");
    expect(toughness).toMatchObject({
      grantedThrough: [{ name: "General" }],
      name: "Toughness",
      stacks: true,
    });
    expect(await grantable(fork.id, klass.id, "Aura")).toContain("Aura (Cleric)");
    expect(await grantable(fork.id, klass.id, "Power Attack")).toContain("Power Attack");
    // Another class's features aren't the cleric's
    expect(await grantable(fork.id, klass.id, "Flurry")).not.toContain("Flurry of Blows (Monk)");
  });

  test("create a new class's feature in its own pool, made by its first, and refuse a name it has", async () => {
    const { session, fork } = await forkWithClass("Cleric");
    const witch = await EntitiesService.createEntity(session, fork.id, "classes", { name: "Witch" });
    expect((await readOffers(fork.id, witch.id)).ownFeaturePool).toMatchObject({
      id: null,
      name: "Witch Class Feature",
    });

    // What a typed name creates: its rules' name, "Hex (Witch)" as typed too, and whether the ruleset has it
    expect(await newFeature(fork.id, witch.id, "Hex")).toEqual({ exists: false, name: "Hex (Witch)" });
    expect(await newFeature(fork.id, witch.id, " Hex (Witch) ")).toEqual({ exists: false, name: "Hex (Witch)" });
    expect(await newFeature(fork.id, witch.id, "Cash $&")).toEqual({ exists: false, name: "Cash $& (Witch)" });
    expect(newFeature(fork.id, witch.id, "  ")).rejects.toMatchObject({ refusal: "invalid" });

    const hex = await EntitiesService.createFeature(session, fork.id, "classes", witch.id, "Hex");
    const evilEye = await EntitiesService.createFeature(session, fork.id, "classes", witch.id, "Evil Eye (Witch)");

    expect([hex.name, evilEye.name, hex.via.name]).toEqual(["Hex (Witch)", "Evil Eye (Witch)", "Witch Class Feature"]);
    // One pool for both, listing both, and each feature its rules' flags: never picked at a level up, not Stackable
    expect(evilEye.via.id).toBe(hex.via.id);
    const pool = (await Entities.findOne<Aptitude>(db, { entityType: "aptitudes", id: hex.via.id }))!;
    expect(pool.name).toBe("Witch Class Feature");
    const listed = await EntityLinks.findMany(db, { fromIds: [hex.id, evilEye.id], role: "listedIn" });
    expect(listed.map((link) => link.toId)).toEqual([pool.id, pool.id]);
    const feat = (await Entities.findOne<Feat>(db, { entityType: "feats", id: hex.id }))!;
    expect([feat.fields[FEAT_SELECTABLE], feat.fields[FEAT_STACKABLE]]).toEqual([false, false]);
    expect((await findFormValues("feats", hex.id)).fields[FEAT_STACKABLE]).toEqual([false]);
    RulesetViews.invalidate(fork.id);
    expect(await readOffers(fork.id, witch.id)).toMatchObject({
      featurePools: expect.arrayContaining(["Witch Class Feature"]),
      ownFeaturePool: { id: pool.id },
    });
    expect(await grantable(fork.id, witch.id, "Hex")).toEqual(["Hex (Witch)"]);
    expect(await newFeature(fork.id, witch.id, "Hex")).toEqual({ exists: true, name: "Hex (Witch)" });

    expect(EntitiesService.createFeature(session, fork.id, "classes", witch.id, "Hex")).rejects.toMatchObject({
      message: "Hex (Witch) already exists",
      refusal: "conflict",
    });
    expect(EntitiesService.createFeature(session, fork.id, "classes", witch.id, "   ")).rejects.toMatchObject({
      refusal: "invalid",
    });
  });
});
