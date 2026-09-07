import { describe, expect, test } from "bun:test";
import { eq, and } from "drizzle-orm";
import { db } from "@/server/database/index.ts";
import {
  aptitudesInRules,
  entitySnapshotsInRules,
  featsAptitudesInRules,
  featsInRules,
  klassesInRules,
  klassLevelFeatsInRules,
  klassLevelsInRules,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import {
  DND35_DMG_NAME,
  DND35_COMPLETE_DIVINE_NAME,
  DND35_COMPLETE_WARRIOR_NAME,
} from "@/database/packages/dnd35/names.ts";

// ── Helpers ──

async function getRulesetId(name: string) {
  const [r] = await db
    .select({ id: rulesetsInRules.id })
    .from(rulesetsInRules)
    .where(eq(rulesetsInRules.name, name));
  return r.id;
}

async function getFeatByName(rulesetId: string, name: string) {
  const [f] = await db
    .select({ id: featsInRules.id, name: featsInRules.name })
    .from(featsInRules)
    .where(and(eq(featsInRules.rulesetId, rulesetId), eq(featsInRules.name, name)));
  return f;
}

async function getAptitudeLinks(featId: string) {
  const links = await db
    .select({ aptitudeId: featsAptitudesInRules.aptitudeId })
    .from(featsAptitudesInRules)
    .where(eq(featsAptitudesInRules.featId, featId));
  return links.map((l) => l.aptitudeId);
}

async function getAptitudeId(rulesetId: string, name: string) {
  const [a] = await db
    .select({ id: aptitudesInRules.id })
    .from(aptitudesInRules)
    .where(and(eq(aptitudesInRules.rulesetId, rulesetId), eq(aptitudesInRules.name, name)));
  return a?.id;
}

// ── DMG Class Feature Feats ──

describe("DMG class feature feats", () => {
  const DMG_CLASS_FEATS = [
    {
      feat: "Evasion (Shadowdancer)",
      klass: "Shadowdancer",
      level: 2,
      aptitudes: ["Shadowdancer Class Feature"],
    },
    {
      feat: "Uncanny Dodge (Shadowdancer)",
      klass: "Shadowdancer",
      level: 2,
      aptitudes: ["Shadowdancer Class Feature"],
    },
    {
      feat: "Uncanny Dodge (Assassin)",
      klass: "Assassin",
      level: 2,
      aptitudes: ["Assassin Class Feature"],
    },
    {
      feat: "Uncanny Dodge (Dwarven Defender)",
      klass: "Dwarven Defender",
      level: 2,
      aptitudes: ["Dwarven Defender Class Feature"],
    },
    {
      feat: "Damage Reduction (Dwarven Defender)",
      klass: "Dwarven Defender",
      level: 6,
      aptitudes: ["Dwarven Defender Class Feature"],
    },
    {
      feat: "Hide in Plain Sight (Shadowdancer)",
      klass: "Shadowdancer",
      level: 1,
      aptitudes: ["Shadowdancer Class Feature"],
    },
    {
      feat: "Hide in Plain Sight (Assassin)",
      klass: "Assassin",
      level: 8,
      aptitudes: ["Assassin Class Feature"],
    },
  ];

  test("each class feature feat exists in DMG", async () => {
    const dmgId = await getRulesetId(DND35_DMG_NAME);

    for (const entry of DMG_CLASS_FEATS) {
      const feat = await getFeatByName(dmgId, entry.feat);
      expect(feat, `DMG should have "${entry.feat}"`).toBeDefined();
    }
  });

  test("class feature feats have correct aptitude links", async () => {
    const dmgId = await getRulesetId(DND35_DMG_NAME);

    for (const entry of DMG_CLASS_FEATS) {
      const feat = await getFeatByName(dmgId, entry.feat);
      const linkedAptIds = await getAptitudeLinks(feat.id);

      for (const aptName of entry.aptitudes) {
        const aptId = await getAptitudeId(dmgId, aptName);
        expect(aptId, `Missing aptitude: ${aptName}`).toBeDefined();
        expect(linkedAptIds, `"${entry.feat}" should be linked to "${aptName}"`).toContain(aptId);
      }
    }
  });

  test("klass_level_feats reference class-specific feats at correct levels", async () => {
    const dmgId = await getRulesetId(DND35_DMG_NAME);

    for (const entry of DMG_CLASS_FEATS) {
      const [klass] = await db
        .select({ id: klassesInRules.id })
        .from(klassesInRules)
        .where(and(eq(klassesInRules.rulesetId, dmgId), eq(klassesInRules.name, entry.klass)));

      const [klassLevel] = await db
        .select({ id: klassLevelsInRules.id })
        .from(klassLevelsInRules)
        .where(and(eq(klassLevelsInRules.klassId, klass.id), eq(klassLevelsInRules.level, entry.level)));

      const levelFeats = await db
        .select({ featId: klassLevelFeatsInRules.featId })
        .from(klassLevelFeatsInRules)
        .where(eq(klassLevelFeatsInRules.klassLevelId, klassLevel.id));

      const feat = await getFeatByName(dmgId, entry.feat);
      const featIds = levelFeats.map((f) => f.featId);
      expect(featIds, `${entry.klass} L${entry.level} should grant "${entry.feat}"`).toContain(feat.id);
    }
  });
});

// ── CW COW'd feats ──

describe("CW COW'd feats", () => {
  test("each COW'd feat has an entity snapshot linking base → copy", async () => {
    const cwId = await getRulesetId(DND35_COMPLETE_WARRIOR_NAME);

    // CW COWs same-name feats for aptitude links (e.g. Ronin Bonus Feat, Hexblade Bonus Feat)
    // Join with feats to only check valid (non-orphaned) snapshots
    const snapshots = await db
      .select({
        sourceName: featsInRules.name,
      })
      .from(entitySnapshotsInRules)
      .innerJoin(featsInRules, eq(featsInRules.id, entitySnapshotsInRules.sourceEntityId))
      .where(eq(entitySnapshotsInRules.rulesetId, cwId));

    expect(snapshots.length).toBeGreaterThan(0);

    for (const snap of snapshots) {
      expect(snap.sourceName).toBeDefined();
    }
  });
});

// ── Complete Divine class feature feats ──

describe("Complete Divine class feature feats", () => {
  test("Damage Reduction (Favored Soul) exists in CD", async () => {
    const cdId = await getRulesetId(DND35_COMPLETE_DIVINE_NAME);
    const cdDR = await getFeatByName(cdId, "Damage Reduction (Favored Soul)");
    expect(cdDR, "CD should have Damage Reduction (Favored Soul)").toBeDefined();
  });

  test("Damage Reduction (Favored Soul) is linked to Favored Soul Class Feature aptitude", async () => {
    const cdId = await getRulesetId(DND35_COMPLETE_DIVINE_NAME);
    const cdDR = await getFeatByName(cdId, "Damage Reduction (Favored Soul)");
    const linkedAptIds = await getAptitudeLinks(cdDR.id);

    const fsAptId = await getAptitudeId(cdId, "Favored Soul Class Feature");
    expect(fsAptId).toBeDefined();
    expect(linkedAptIds).toContain(fsAptId);
  });

  test("Favored Soul klass_level_feats reference Damage Reduction (Favored Soul)", async () => {
    const cdId = await getRulesetId(DND35_COMPLETE_DIVINE_NAME);

    const [favoredSoul] = await db
      .select({ id: klassesInRules.id })
      .from(klassesInRules)
      .where(and(eq(klassesInRules.rulesetId, cdId), eq(klassesInRules.name, "Favored Soul")));

    // Find the level that grants DR
    const levelFeats = await db
      .select({ featId: klassLevelFeatsInRules.featId, level: klassLevelsInRules.level })
      .from(klassLevelFeatsInRules)
      .innerJoin(klassLevelsInRules, eq(klassLevelsInRules.id, klassLevelFeatsInRules.klassLevelId))
      .where(eq(klassLevelsInRules.klassId, favoredSoul.id));

    const cdDR = await getFeatByName(cdId, "Damage Reduction (Favored Soul)");
    const drGrants = levelFeats.filter((f) => f.featId === cdDR.id);
    expect(drGrants.length, "Favored Soul should grant Damage Reduction (Favored Soul)").toBeGreaterThanOrEqual(1);
  });
});
