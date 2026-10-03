import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { aptitudesInRules, featsAptitudesInRules, klassLevelFeatsInRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { BadRequestError, ConflictError } from "@/server/errors/index.ts";
import { Characters, EntitySnapshots, Klasses, Properties } from "@/server/repositories/index.ts";
import { ClassLevelsService } from "@/server/services/rulesets/classes/levels/index.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import { PowersService } from "@/server/services/rulesets/powers/index.ts";
import {
  addCharacterLevel,
  createTestCharacter,
  createTestKlassLevel,
  createTestRuleset,
  createTestUserAndRuleset,
  insertRows,
} from "@/tests/helpers.ts";

/** A new user's empty ruleset with three aptitudes. */
async function setup() {
  const { user, session, ruleset } = await createTestUserAndRuleset();
  const aptitudes = await insertRows(
    aptitudesInRules,
    ["Combat", "Metamagic", "General"].map((name) => ({ name, rulesetId: ruleset.id })),
  );
  return { user, session, ruleset, aptitudeIds: aptitudes.map((a) => a.id) };
}

async function linkedAptitudeIds(featId: string) {
  const rows = await db.select().from(featsAptitudesInRules).where(eq(featsAptitudesInRules.featId, featId));
  return rows.map((row) => row.aptitudeId).sort();
}

/** A character of `rulesetId` who picked the feat at their first level. */
async function pickFeat(userId: string, rulesetId: string, featId: string, aptitudeId: string) {
  const character = await createTestCharacter(userId, { rulesetId });
  const { klassLevel } = await createTestKlassLevel(rulesetId);
  await addCharacterLevel(character.id, klassLevel.id, { feats: [{ featId, aptitudeId }] });
  return character;
}

// CRUD, ownership and copy-on-write are covered for every entity in EntityServices.test.ts.
describe("FeatsService", () => {
  describe("aptitudes", () => {
    test("links a feat to its aptitudes; an update replaces them, keeps them when it omits them, and can clear them", async () => {
      const {
        session,
        ruleset,
        aptitudeIds: [combat, metamagic, general],
      } = await setup();
      const feat = await FeatsService.createRulesetFeat(session, ruleset.id, {
        name: "Power Attack",
        aptitudeIds: [combat, metamagic],
      });
      expect(await linkedAptitudeIds(feat.id)).toEqual([combat, metamagic].sort());

      await FeatsService.updateRulesetFeat(session, ruleset.id, feat.id, {
        name: "Power Attack",
        aptitudeIds: [general],
      });
      expect(await linkedAptitudeIds(feat.id)).toEqual([general]);

      await FeatsService.updateRulesetFeat(session, ruleset.id, feat.id, {
        name: "Power Attack",
        description: "Renamed only",
      });
      expect(await linkedAptitudeIds(feat.id)).toEqual([general]);

      await FeatsService.updateRulesetFeat(session, ruleset.id, feat.id, { name: "Power Attack", aptitudeIds: [] });
      expect(await linkedAptitudeIds(feat.id)).toEqual([]);
    });

    test("refuses a new feat without an aptitude", async () => {
      const { session, ruleset } = await setup();
      await expect(
        FeatsService.createRulesetFeat(session, ruleset.id, { name: "Orphan Feat", aptitudeIds: [] }),
      ).rejects.toThrow(BadRequestError);
    });

    test("refuses an aptitude that spells already use", async () => {
      const {
        session,
        ruleset,
        aptitudeIds: [combat, spells],
      } = await setup();
      await PowersService.createRulesetPower(session, ruleset.id, {
        name: "Magic Missile",
        aptitudes: [{ id: spells }],
      });
      await expect(
        FeatsService.createRulesetFeat(session, ruleset.id, { name: "Spell Feat", aptitudeIds: [spells] }),
      ).rejects.toThrow(ConflictError);

      const feat = await FeatsService.createRulesetFeat(session, ruleset.id, {
        name: "Combat Feat",
        aptitudeIds: [combat],
      });
      await expect(
        FeatsService.updateRulesetFeat(session, ruleset.id, feat.id, { name: "Combat Feat", aptitudeIds: [spells] }),
      ).rejects.toThrow(ConflictError);
    });
  });

  test("groups a family's variants into one row, filtered by aptitude", async () => {
    const {
      session,
      ruleset,
      aptitudeIds: [combat, general],
    } = await setup();
    for (const name of ["Focus: Axe", "Focus: Sword"]) {
      const feat = await FeatsService.createRulesetFeat(session, ruleset.id, { name, aptitudeIds: [combat] });
      await Properties.create(db, { entityId: feat.id, entityType: "feats", type: "FEAT_FAMILY", value: "Focus" });
    }
    await FeatsService.createRulesetFeat(session, ruleset.id, { name: "Cleave", aptitudeIds: [combat] });
    await FeatsService.createRulesetFeat(session, ruleset.id, { name: "Alertness", aptitudeIds: [general] });

    const grouped = await FeatsService.getRulesetFeatsGrouped(
      ruleset.id,
      { aptitudeId: combat },
      { limit: 10, page: 1 },
    );
    expect(grouped.items.map((row) => ({ ...row, variantCount: Number(row.variantCount) }))).toMatchObject([
      { displayName: "Cleave", family: null, variantCount: 1 },
      { displayName: "Focus", family: "Focus", variantCount: 2 },
    ]);
  });

  test("deletes a feat's aptitude and class-level links with it", async () => {
    const {
      session,
      ruleset,
      aptitudeIds: [combat],
    } = await setup();
    const feat = await FeatsService.createRulesetFeat(session, ruleset.id, {
      name: "Doomed Feat",
      aptitudeIds: [combat],
    });
    const [klass] = await Klasses.create(db, { name: "Granting Class", rulesetId: ruleset.id, hd: 10 });
    await ClassLevelsService.createClassLevel(session, ruleset.id, klass.id, {
      level: 1,
      bab: 1,
      skills: 2,
      feats: [{ featId: feat.id, aptitudeId: combat }],
    });

    await FeatsService.deleteRulesetFeat(session, ruleset.id, feat.id);

    expect(await linkedAptitudeIds(feat.id)).toEqual([]);
    expect(await db.select().from(klassLevelFeatsInRules).where(eq(klassLevelFeatsInRules.featId, feat.id))).toEqual(
      [],
    );
  });

  describe("deleting a feat characters picked", () => {
    test("is refused while a character of the ruleset has picked it, even an archived one", async () => {
      const {
        user,
        session,
        ruleset,
        aptitudeIds: [combat],
      } = await setup();
      const feat = await FeatsService.createRulesetFeat(session, ruleset.id, {
        name: "Picked Feat",
        aptitudeIds: [combat],
      });
      const character = await pickFeat(user.id, ruleset.id, feat.id, combat);
      await expect(FeatsService.deleteRulesetFeat(session, ruleset.id, feat.id)).rejects.toThrow(ConflictError);

      // An archived character keeps its picks so unarchiving restores them.
      await Characters.archive(db, { id: character.id });
      await expect(FeatsService.deleteRulesetFeat(session, ruleset.id, feat.id)).rejects.toThrow(ConflictError);
    });

    test("is refused when a character of a fork picked it", async () => {
      const {
        user,
        session,
        ruleset: parent,
        aptitudeIds: [combat],
      } = await setup();
      const feat = await FeatsService.createRulesetFeat(session, parent.id, {
        name: "Inherited Feat",
        aptitudeIds: [combat],
      });
      const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });
      await pickFeat(user.id, fork.id, feat.id, combat);
      await expect(FeatsService.deleteRulesetFeat(session, parent.id, feat.id)).rejects.toThrow(ConflictError);
    });

    test("is refused when a character of a ruleset using it as an extension picked it", async () => {
      const {
        user,
        session,
        ruleset: extension,
        aptitudeIds: [combat],
      } = await setup();
      const feat = await FeatsService.createRulesetFeat(session, extension.id, {
        name: "Extension Feat",
        aptitudeIds: [combat],
      });
      const host = await createTestRuleset(user.id, { extensionRulesetIds: [extension.id] });
      await pickFeat(user.id, host.id, feat.id, combat);
      await expect(FeatsService.deleteRulesetFeat(session, extension.id, feat.id)).rejects.toThrow(ConflictError);
    });

    test("is allowed when the ruleset's characters didn't pick it", async () => {
      const {
        user,
        session,
        ruleset,
        aptitudeIds: [combat],
      } = await setup();
      await createTestCharacter(user.id, { rulesetId: ruleset.id });
      const feat = await FeatsService.createRulesetFeat(session, ruleset.id, {
        name: "Unpicked Feat",
        aptitudeIds: [combat],
      });
      expect(await FeatsService.deleteRulesetFeat(session, ruleset.id, feat.id)).toMatchObject({ id: feat.id });
    });
  });

  test("points the fork's tombstone at a feat re-created under a deleted copy's name", async () => {
    // Regression: writes once rewrote the snapshot's source through the fork's
    // override map, leaving the tombstone pointing at the deleted copy.
    const {
      user,
      session,
      ruleset: parent,
      aptitudeIds: [combat],
    } = await setup();
    const source = await FeatsService.createRulesetFeat(session, parent.id, {
      name: "Endurance",
      aptitudeIds: [combat],
    });
    const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });

    const copy = await FeatsService.updateRulesetFeat(session, fork.id, source.id, {
      name: "Endurance",
      description: "Edited in fork",
    });
    await FeatsService.deleteRulesetFeat(session, fork.id, copy.id);
    const recreated = await FeatsService.createRulesetFeat(session, fork.id, {
      name: "Endurance",
      aptitudeIds: [combat],
    });

    const snapshots = await EntitySnapshots.findMany(db, { rulesetId: fork.id, entityType: "feats" });
    expect(snapshots).toMatchObject([{ sourceEntityId: source.id, forkedEntityId: recreated.id }]);
  });
});
