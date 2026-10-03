import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import {
  featsAptitudesInRules,
  klassLevelFeatsInRules,
  klassLevelPowersInRules,
  powersAptitudesInRules,
} from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Feats, Klasses, Powers } from "@/server/repositories/index.ts";
import { AptitudesService } from "@/server/services/rulesets/aptitudes/index.ts";
import { ClassLevelsService } from "@/server/services/rulesets/classes/levels/index.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import { PowersService } from "@/server/services/rulesets/powers/index.ts";
import {
  addCharacterLevel,
  createTestCharacter,
  createTestKlassLevel,
  createTestUserAndRuleset,
  insertRows,
} from "@/tests/helpers.ts";

// CRUD, ownership and copy-on-write are covered for every entity in EntityServices.test.ts.
describe("AptitudesService", () => {
  test("stores an aptitude's description", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const created = await AptitudesService.createRulesetAptitude(session, ruleset.id, {
      name: "Arcane Spells",
      description: "Wizard and sorcerer spells",
    });
    expect(created).toMatchObject({ name: "Arcane Spells", description: "Wizard and sorcerer spells" });
    const updated = await AptitudesService.updateRulesetAptitude(session, ruleset.id, created.id, {
      name: "Arcane Spells",
      description: "Updated",
    });
    expect(updated.description).toBe("Updated");
  });

  test("deletes the feat, power and class-level links of a deleted aptitude", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const featAptitude = await AptitudesService.createRulesetAptitude(session, ruleset.id, { name: "Feat Aptitude" });
    const powerAptitude = await AptitudesService.createRulesetAptitude(session, ruleset.id, { name: "Power Aptitude" });
    await FeatsService.createRulesetFeat(session, ruleset.id, { name: "Linked Feat", aptitudeIds: [featAptitude.id] });
    await PowersService.createRulesetPower(session, ruleset.id, {
      name: "Linked Power",
      aptitudes: [{ id: powerAptitude.id }],
    });

    const [feat] = await Feats.create(db, { name: "Granted Feat", rulesetId: ruleset.id });
    const [power] = await Powers.create(db, { name: "Granted Power", rulesetId: ruleset.id });
    const [klass] = await Klasses.create(db, { name: "Granting Class", rulesetId: ruleset.id, hd: 10 });
    const level = await ClassLevelsService.createClassLevel(session, ruleset.id, klass.id, {
      level: 1,
      bab: 1,
      skills: 2,
      feats: [{ featId: feat.id, aptitudeId: featAptitude.id }],
    });
    await insertRows(klassLevelPowersInRules, [
      { klassLevelId: level.id, powerId: power.id, aptitudeId: powerAptitude.id },
    ]);

    await AptitudesService.deleteRulesetAptitude(session, ruleset.id, featAptitude.id);
    await AptitudesService.deleteRulesetAptitude(session, ruleset.id, powerAptitude.id);

    expect(
      await db.select().from(featsAptitudesInRules).where(eq(featsAptitudesInRules.aptitudeId, featAptitude.id)),
    ).toEqual([]);
    expect(
      await db.select().from(powersAptitudesInRules).where(eq(powersAptitudesInRules.aptitudeId, powerAptitude.id)),
    ).toEqual([]);
    expect(
      await db.select().from(klassLevelFeatsInRules).where(eq(klassLevelFeatsInRules.aptitudeId, featAptitude.id)),
    ).toEqual([]);
    expect(
      await db.select().from(klassLevelPowersInRules).where(eq(klassLevelPowersInRules.aptitudeId, powerAptitude.id)),
    ).toEqual([]);
  });

  test("refuses to delete an aptitude a character picked a feat or a power through", async () => {
    const { user, session, ruleset } = await createTestUserAndRuleset();
    const featAptitude = await AptitudesService.createRulesetAptitude(session, ruleset.id, { name: "Feat Aptitude" });
    const powerAptitude = await AptitudesService.createRulesetAptitude(session, ruleset.id, { name: "Power Aptitude" });
    const feat = await FeatsService.createRulesetFeat(session, ruleset.id, {
      name: "Picked Feat",
      aptitudeIds: [featAptitude.id],
    });
    const power = await PowersService.createRulesetPower(session, ruleset.id, {
      name: "Picked Power",
      aptitudes: [{ id: powerAptitude.id }],
    });
    const character = await createTestCharacter(user.id, { rulesetId: ruleset.id });
    const { klassLevel } = await createTestKlassLevel(ruleset.id);
    await addCharacterLevel(character.id, klassLevel.id, {
      feats: [{ featId: feat.id, aptitudeId: featAptitude.id }],
      powers: [{ powerId: power.id, aptitudeId: powerAptitude.id }],
    });

    await expect(AptitudesService.deleteRulesetAptitude(session, ruleset.id, featAptitude.id)).rejects.toThrow(
      ConflictError,
    );
    await expect(AptitudesService.deleteRulesetAptitude(session, ruleset.id, powerAptitude.id)).rejects.toThrow(
      ConflictError,
    );
  });
});
