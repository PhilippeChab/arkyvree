import { describe, expect, test } from "bun:test";

import {
  DND35_COMPLETE_DIVINE_NAME,
  DND35_COMPLETE_WARRIOR_NAME,
  DND35_DMG_NAME,
} from "@/database/packages/dnd35/names.ts";
import { db } from "@/server/database/index.ts";
import { EntitySnapshots, Rulesets } from "@/server/repositories/index.ts";
import { seededRows } from "@/tests/seeds/seededRows.ts";

describe("The seeded extensions", () => {
  test.each([
    [DND35_DMG_NAME, "Evasion (Shadowdancer)", "Shadowdancer", 2],
    [DND35_DMG_NAME, "Uncanny Dodge (Shadowdancer)", "Shadowdancer", 2],
    [DND35_DMG_NAME, "Hide in Plain Sight (Shadowdancer)", "Shadowdancer", 1],
    [DND35_DMG_NAME, "Uncanny Dodge (Assassin)", "Assassin", 2],
    [DND35_DMG_NAME, "Hide in Plain Sight (Assassin)", "Assassin", 8],
    [DND35_DMG_NAME, "Uncanny Dodge (Dwarven Defender)", "Dwarven Defender", 2],
    [DND35_DMG_NAME, "Damage Reduction (Dwarven Defender)", "Dwarven Defender", 6],
    [DND35_COMPLETE_DIVINE_NAME, "Damage Reduction (Favored Soul)", "Favored Soul", 20],
  ])("%s: %s is a class feature a %s gets at level %i", async (ruleset, name, klass, level) => {
    const rows = await seededRows(ruleset);
    const feat = rows.feat(name);
    expect(feat.featsAptitudesInRules.map((link) => link.aptitudeId)).toContain(
      rows.aptitude(`${klass} Class Feature`).id,
    );
    expect(
      rows.klassLevelFeats
        .filter((grant) => grant.klassLevelId === rows.klassLevel(klass, level).id)
        .map((grant) => grant.featId),
    ).toContain(feat.id);
  });

  test("copy core feats under their names, each copy recorded against its source", async () => {
    const warrior = await seededRows(DND35_COMPLETE_WARRIOR_NAME);
    const coreFeats = new Map((await seededRows()).feats.map((feat) => [feat.id, feat]));
    const snapshots = (
      await EntitySnapshots.findMany(db, { rulesetId: warrior.rulesetId, entityType: "feats" })
    ).filter((s) => coreFeats.has(s.sourceEntityId));
    expect(snapshots.length).toBeGreaterThan(0);
    for (const snapshot of snapshots) {
      expect(warrior.feats.find((feat) => feat.id === snapshot.forkedEntityId)?.name).toBe(
        coreFeats.get(snapshot.sourceEntityId)!.name,
      );
    }
  });

  // Regression: a domain spell an extension copies from the core rules (Complete Divine's Magic Missile, for the
  // Force domain) lost the core spell's class spell lists, so forks using the extension lost it from Wizard Spells.
  test("keep the class spell lists of the core spells their domains copy", async () => {
    const core = await seededRows();
    const corePowers = new Map(core.powers.map((power) => [power.id, power]));
    const failures: string[] = [];
    let copies = 0;
    for (const extension of (await Rulesets.findMany(db, { system: true })).filter((r) => r.id !== core.rulesetId)) {
      const rows = await seededRows(extension.name);
      for (const { sourceEntityId, forkedEntityId } of await EntitySnapshots.findMany(db, {
        rulesetId: extension.id,
        entityType: "powers",
      })) {
        const source = corePowers.get(sourceEntityId);
        const copy = rows.powers.find((power) => power.id === forkedEntityId);
        if (!source || !copy) continue;
        const copyLists = new Set(copy.powersAptitudesInRules.map((link) => link.aptitudeId));
        // A copy with a list of its own was made for a domain.
        if (![...copyLists].some((id) => !source.powersAptitudesInRules.some((link) => link.aptitudeId === id)))
          continue;
        copies++;
        const lost = source.powersAptitudesInRules.filter(
          (link) => link.aptitudesInRule.name.endsWith("Spells") && !copyLists.has(link.aptitudeId),
        );
        if (lost.length > 0)
          failures.push(
            `${extension.name}: ${copy.name} lost ${lost.map((link) => link.aptitudesInRule.name).join(", ")}`,
          );
      }
    }
    expect(copies).toBeGreaterThan(0);
    expect(failures).toEqual([]);

    const divine = await seededRows(DND35_COMPLETE_DIVINE_NAME);
    const missile = divine.powers.find((power) => power.name === "Magic Missile")!;
    const snapshot = (await EntitySnapshots.findMany(db, { rulesetId: divine.rulesetId, entityType: "powers" })).find(
      (s) => s.forkedEntityId === missile.id,
    );
    expect(snapshot?.sourceEntityId).toBe(core.powers.find((power) => power.name === "Magic Missile")!.id);
    expect(missile.powersAptitudesInRules.map((link) => link.aptitudeId)).toContain(
      divine.aptitude("Force Domain Spells").id,
    );
  });
});
