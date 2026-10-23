import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Feats, Klasses, KlassLevelPowers, Powers } from "@/server/repositories/index.ts";
import StoredJoins from "@/server/repositories/stored/StoredJoins.ts";
import { AptitudesService } from "@/server/services/rulesets/aptitudes/index.ts";
import { ClassLevelsService } from "@/server/services/rulesets/classes/levels/index.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import { PowersService } from "@/server/services/rulesets/powers/index.ts";
import { createTestCharacter } from "@/tests/support/characters.ts";
import { addCharacterLevel, createTestKlassLevel } from "@/tests/support/levels.ts";
import { createTestUserAndRuleset } from "@/tests/support/rulesets.ts";

/**
 * A join's rows that name the aptitude by a part of their links: as the list a feat or a power is in (`to`), or the one
 * a grant is through (`via`).
 */
async function linksOf(join: string, part: "to" | "via", aptitudeId: string) {
  return await StoredJoins.findRows(db, join, eq(StoredJoins.getPart(part), aptitudeId));
}

// CRUD, ownership and copy-on-write are covered for every entity in EntityServices.test.ts.
describe("AptitudesService", () => {
  test("stores an aptitude's description", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const created = await AptitudesService.createAptitude(session, ruleset.id, {
      name: "Arcane Spells",
      description: "Wizard and sorcerer spells",
    });
    expect(created).toMatchObject({ name: "Arcane Spells", description: "Wizard and sorcerer spells" });
    const updated = await AptitudesService.updateAptitude(session, ruleset.id, created.id, {
      name: "Arcane Spells",
      description: "Updated",
    });
    expect(updated.description).toBe("Updated");
  });

  test("keeps General, which the general feats count toward: neither renamed nor deleted, still described", async () => {
    const {
      session,
      ruleset,
      aptitudeIds: [generalId],
    } = await createTestUserAndRuleset(["General"]);
    expect(
      AptitudesService.updateAptitude(session, ruleset.id, generalId, { name: "General Feats" }),
    ).rejects.toMatchObject({ refusal: "unprocessable" });
    expect(AptitudesService.deleteAptitude(session, ruleset.id, generalId)).rejects.toMatchObject({
      refusal: "unprocessable",
    });
    const described = await AptitudesService.updateAptitude(session, ruleset.id, generalId, {
      name: "General",
      description: "Any feat",
    });
    expect(described.description).toBe("Any feat");
    // By its slug, which the engine and the target paths know it by: a new case is no change to them
    const recased = await AptitudesService.updateAptitude(session, ruleset.id, generalId, { name: "GENERAL" });
    expect(recased.name).toBe("GENERAL");
    expect(AptitudesService.deleteAptitude(session, ruleset.id, generalId)).rejects.toMatchObject({
      refusal: "unprocessable",
    });
  });

  test("deletes the feat, power and class-level links of a deleted aptitude", async () => {
    const { session, ruleset } = await createTestUserAndRuleset();
    const featAptitude = await AptitudesService.createAptitude(session, ruleset.id, { name: "Feat Aptitude" });
    const powerAptitude = await AptitudesService.createAptitude(session, ruleset.id, { name: "Power Aptitude" });
    await FeatsService.createFeat(session, ruleset.id, { name: "Linked Feat", aptitudeIds: [featAptitude.id] });
    await PowersService.createPower(session, ruleset.id, {
      name: "Linked Power",
      aptitudes: [{ id: powerAptitude.id }],
    });

    const [feat] = await Feats.create(db, { name: "Granted Feat", rulesetId: ruleset.id });
    const [power] = await Powers.create(db, { name: "Granted Power", rulesetId: ruleset.id });
    const [klass] = await Klasses.create(db, { name: "Granting Class", rulesetId: ruleset.id, hd: 10 });
    const level = await ClassLevelsService.createClassLevel(session, ruleset.id, klass.id, {
      level: 1,
      fields: { bab: 1, skills: 2 },
      feats: [{ featId: feat.id, aptitudeId: featAptitude.id }],
    });
    await KlassLevelPowers.create(db, { klassLevelId: level.id, powerId: power.id, aptitudeId: powerAptitude.id });

    await AptitudesService.deleteAptitude(session, ruleset.id, featAptitude.id);
    await AptitudesService.deleteAptitude(session, ruleset.id, powerAptitude.id);

    expect(await linksOf("feats_aptitudes", "to", featAptitude.id)).toEqual([]);
    expect(await linksOf("powers_aptitudes", "to", powerAptitude.id)).toEqual([]);
    expect(await linksOf("klass_level_feats", "via", featAptitude.id)).toEqual([]);
    expect(await linksOf("klass_level_powers", "via", powerAptitude.id)).toEqual([]);
  });

  test("refuses to delete an aptitude a character picked a feat or a power through", async () => {
    const { user, session, ruleset } = await createTestUserAndRuleset();
    const featAptitude = await AptitudesService.createAptitude(session, ruleset.id, { name: "Feat Aptitude" });
    const powerAptitude = await AptitudesService.createAptitude(session, ruleset.id, { name: "Power Aptitude" });
    const feat = await FeatsService.createFeat(session, ruleset.id, {
      name: "Picked Feat",
      aptitudeIds: [featAptitude.id],
    });
    const power = await PowersService.createPower(session, ruleset.id, {
      name: "Picked Power",
      aptitudes: [{ id: powerAptitude.id }],
    });
    const character = await createTestCharacter(user.id, { rulesetId: ruleset.id });
    const { klassLevel } = await createTestKlassLevel(ruleset.id);
    await addCharacterLevel(character.id, klassLevel.id, {
      feats: [{ featId: feat.id, aptitudeId: featAptitude.id }],
      powers: [{ powerId: power.id, aptitudeId: powerAptitude.id }],
    });

    expect(AptitudesService.deleteAptitude(session, ruleset.id, featAptitude.id)).rejects.toThrow(ConflictError);
    expect(AptitudesService.deleteAptitude(session, ruleset.id, powerAptitude.id)).rejects.toThrow(ConflictError);
  });
});
