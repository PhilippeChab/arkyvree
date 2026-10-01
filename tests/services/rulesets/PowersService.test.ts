import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { aptitudesInRules, klassLevelPowersInRules, powersAptitudesInRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { BadRequestError, ConflictError } from "@/server/errors/index.ts";
import { Properties } from "@/server/repositories/index.ts";
import { FeatsMethods } from "@/server/services/rulesets/FeatsService.ts";
import { PowersMethods } from "@/server/services/rulesets/PowersService.ts";
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
    ["Wizard", "Cleric", "Druid"].map((name) => ({ name, rulesetId: ruleset.id })),
  );
  return { user, session, ruleset, aptitudeIds: aptitudes.map((a) => a.id) };
}

async function linkedAptitudes(powerId: string) {
  const rows = await db.select().from(powersAptitudesInRules).where(eq(powersAptitudesInRules.powerId, powerId));
  return rows
    .map(({ aptitudeId, level }) => ({ aptitudeId, level }))
    .sort((a, b) => a.aptitudeId.localeCompare(b.aptitudeId));
}

const sorted = (links: { aptitudeId: string; level: number | null }[]) =>
  [...links].sort((a, b) => a.aptitudeId.localeCompare(b.aptitudeId));

// CRUD, ownership and copy-on-write are covered for every entity in EntityServices.test.ts,
// and the spell properties a power generates in GeneratedFeats.test.ts.
describe("PowersService", () => {
  describe("aptitudes", () => {
    test("links a power to its aptitudes at a level; an update replaces them, keeps them when it omits them, and can clear them", async () => {
      const {
        session,
        ruleset,
        aptitudeIds: [wizard, cleric, druid],
      } = await setup();
      const power = await PowersMethods.createRulesetPower(session, ruleset.id, {
        name: "Fireball",
        aptitudes: [{ id: wizard, level: 3 }, { id: cleric }],
      });
      expect(await linkedAptitudes(power.id)).toEqual(
        sorted([
          { aptitudeId: wizard, level: 3 },
          { aptitudeId: cleric, level: null },
        ]),
      );

      await PowersMethods.updateRulesetPower(session, ruleset.id, power.id, {
        name: "Fireball",
        aptitudes: [{ id: druid, level: 4 }],
      });
      expect(await linkedAptitudes(power.id)).toEqual([{ aptitudeId: druid, level: 4 }]);

      await PowersMethods.updateRulesetPower(session, ruleset.id, power.id, {
        name: "Fireball",
        description: "Renamed only",
      });
      expect(await linkedAptitudes(power.id)).toEqual([{ aptitudeId: druid, level: 4 }]);

      await PowersMethods.updateRulesetPower(session, ruleset.id, power.id, { name: "Fireball", aptitudes: [] });
      expect(await linkedAptitudes(power.id)).toEqual([]);
    });

    test("refuses a new power without an aptitude", async () => {
      const { session, ruleset } = await setup();
      await expect(
        PowersMethods.createRulesetPower(session, ruleset.id, { name: "Orphan Spell", aptitudes: [] }),
      ).rejects.toThrow(BadRequestError);
    });

    test("refuses an aptitude that feats already use", async () => {
      const {
        session,
        ruleset,
        aptitudeIds: [wizard, feats],
      } = await setup();
      await FeatsMethods.createRulesetFeat(session, ruleset.id, { name: "Power Attack", aptitudeIds: [feats] });
      await expect(
        PowersMethods.createRulesetPower(session, ruleset.id, { name: "Feat Spell", aptitudes: [{ id: feats }] }),
      ).rejects.toThrow(ConflictError);

      const power = await PowersMethods.createRulesetPower(session, ruleset.id, {
        name: "Wizard Spell",
        aptitudes: [{ id: wizard }],
      });
      await expect(
        PowersMethods.updateRulesetPower(session, ruleset.id, power.id, {
          name: "Wizard Spell",
          aptitudes: [{ id: feats }],
        }),
      ).rejects.toThrow(ConflictError);
    });

    test("copies an inherited power's aptitudes into the fork's copy, leaving the parent's", async () => {
      const {
        user,
        session,
        ruleset: parent,
        aptitudeIds: [wizard, cleric],
      } = await setup();
      const source = await PowersMethods.createRulesetPower(session, parent.id, {
        name: "Fireball",
        aptitudes: [{ id: wizard, level: 3 }],
      });
      const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });
      expect((await PowersMethods.getRulesetPower(fork.id, source.id)).powersAptitudesInRules).toMatchObject([
        { aptitudeId: wizard, level: 3 },
      ]);

      const copy = await PowersMethods.updateRulesetPower(session, fork.id, source.id, {
        name: "Fireball",
        aptitudes: [{ id: cleric, level: 2 }],
      });
      expect(await linkedAptitudes(copy.id)).toEqual([{ aptitudeId: cleric, level: 2 }]);
      expect(await linkedAptitudes(source.id)).toEqual([{ aptitudeId: wizard, level: 3 }]);
    });
  });

  test("keeps the properties a user added when the spell's fields change", async () => {
    // Regression: saving the spell fields once replaced every property of the power.
    const {
      session,
      ruleset,
      aptitudeIds: [wizard],
    } = await setup();
    const power = await PowersMethods.createRulesetPower(session, ruleset.id, {
      name: "Fireball",
      aptitudes: [{ id: wizard }],
      school: "Evocation",
      castingTime: "1 round",
    });
    await Properties.create(db, { entityId: power.id, entityType: "powers", type: "SIGNATURE_SPELL", value: "true" });

    await PowersMethods.updateRulesetPower(session, ruleset.id, power.id, { name: "Fireball", school: "Conjuration" });

    const properties = await Properties.findManyByEntity(db, { entityIds: [power.id], entityType: "powers" });
    expect(properties.map(({ type, value }) => ({ type, value })).sort((a, b) => a.type.localeCompare(b.type))).toEqual(
      [
        { type: "SIGNATURE_SPELL", value: "true" },
        { type: "SPELL_SCHOOL", value: "Conjuration" },
      ],
    );
  });

  test("deletes a power's aptitude and class-level links with it", async () => {
    const {
      session,
      ruleset,
      aptitudeIds: [wizard],
    } = await setup();
    const power = await PowersMethods.createRulesetPower(session, ruleset.id, {
      name: "Doomed Spell",
      aptitudes: [{ id: wizard }],
    });
    const { klassLevel } = await createTestKlassLevel(ruleset.id);
    await insertRows(klassLevelPowersInRules, [{ klassLevelId: klassLevel.id, powerId: power.id, aptitudeId: wizard }]);

    await PowersMethods.deleteRulesetPower(session, ruleset.id, power.id);

    expect(await linkedAptitudes(power.id)).toEqual([]);
    expect(
      await db.select().from(klassLevelPowersInRules).where(eq(klassLevelPowersInRules.powerId, power.id)),
    ).toEqual([]);
  });

  test("refuses to delete a power a character picked, even through a ruleset using it as an extension", async () => {
    const {
      user,
      session,
      ruleset: extension,
      aptitudeIds: [wizard],
    } = await setup();
    const power = await PowersMethods.createRulesetPower(session, extension.id, {
      name: "Extension Spell",
      aptitudes: [{ id: wizard }],
    });
    const host = await createTestRuleset(user.id, { extensionRulesetIds: [extension.id] });

    const character = await createTestCharacter(user.id, { rulesetId: host.id });
    const { klassLevel } = await createTestKlassLevel(host.id);
    await addCharacterLevel(character.id, klassLevel.id, { powers: [{ powerId: power.id, aptitudeId: wizard }] });

    await expect(PowersMethods.deleteRulesetPower(session, extension.id, power.id)).rejects.toThrow(ConflictError);
  });
});
