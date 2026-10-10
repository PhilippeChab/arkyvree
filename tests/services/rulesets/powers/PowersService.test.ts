import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { klassLevelPowersInRules, powersAptitudesInRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { Properties } from "@/server/repositories/index.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import { PowersService } from "@/server/services/rulesets/powers/index.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { createTestCharacter } from "@/tests/support/characters.ts";
import { insertRows } from "@/tests/support/database.ts";
import { addCharacterLevel, createTestKlassLevel } from "@/tests/support/levels.ts";
import { createSeededTestRuleset, createTestRuleset, createTestUserAndRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { SPELL_CASTING_TIME, SPELL_SCHOOL } from "@/vocabulary/dnd3.5/properties/index.ts";

/** The aptitudes of the test's ruleset. */
const APTITUDES = ["Wizard", "Cleric", "Druid"];

function sorted(links: { aptitudeId: string; level: number | null }[]) {
  return [...links].sort((a, b) => a.aptitudeId.localeCompare(b.aptitudeId));
}

async function linkedAptitudes(powerId: string) {
  const rows = await db.select().from(powersAptitudesInRules).where(eq(powersAptitudesInRules.powerId, powerId));
  return rows
    .map(({ aptitudeId, level }) => ({ aptitudeId, level }))
    .sort((a, b) => a.aptitudeId.localeCompare(b.aptitudeId));
}

// CRUD, ownership and copy-on-write are covered for every entity in EntityServices.test.ts,
// and the spell properties a power generates in GeneratedFeats.test.ts.
describe("PowersService", () => {
  describe("aptitudes", () => {
    test("links a power to its aptitudes at a level; an update replaces them, keeps them when it omits them, and can clear them", async () => {
      const {
        session,
        ruleset,
        aptitudeIds: [wizard, cleric, druid],
      } = await createTestUserAndRuleset(APTITUDES);
      const power = await PowersService.createPower(session, ruleset.id, {
        name: "Fireball",
        aptitudes: [{ id: wizard, level: 3 }, { id: cleric }],
      });
      expect(await linkedAptitudes(power.id)).toEqual(
        sorted([
          { aptitudeId: wizard, level: 3 },
          { aptitudeId: cleric, level: null },
        ]),
      );

      await PowersService.updatePower(session, ruleset.id, power.id, {
        name: "Fireball",
        aptitudes: [{ id: druid, level: 4 }],
      });
      expect(await linkedAptitudes(power.id)).toEqual([{ aptitudeId: druid, level: 4 }]);

      await PowersService.updatePower(session, ruleset.id, power.id, {
        name: "Fireball",
        description: "Renamed only",
      });
      expect(await linkedAptitudes(power.id)).toEqual([{ aptitudeId: druid, level: 4 }]);

      await PowersService.updatePower(session, ruleset.id, power.id, { name: "Fireball", aptitudes: [] });
      expect(await linkedAptitudes(power.id)).toEqual([]);
    });

    test("links a spell to the lists it names only: a school's specialist list as a domain's", async () => {
      // A new evocation spell on the wizard's list is on the evocation specialist's only when it names it
      const { user, session } = await createTestUser();
      const fork = await createSeededTestRuleset(user.id);
      const { aptMap } = await getSeedCtx();
      const [wizard, specialist] = [aptMap["Wizard Spells"], aptMap["Evocation Specialist Spells"]];
      const wizardOnly = await PowersService.createPower(session, fork.id, {
        name: "Test Bolt",
        fields: { school: "Evocation" },
        aptitudes: [{ id: wizard, level: 3 }],
      });
      expect(await linkedAptitudes(wizardOnly.id)).toEqual([{ aptitudeId: wizard, level: 3 }]);

      const both = await PowersService.createPower(session, fork.id, {
        name: "Test Blast",
        fields: { school: "Evocation" },
        aptitudes: [
          { id: wizard, level: 3 },
          { id: specialist, level: 3 },
        ],
      });
      expect(await linkedAptitudes(both.id)).toEqual(
        sorted([
          { aptitudeId: wizard, level: 3 },
          { aptitudeId: specialist, level: 3 },
        ]),
      );
    });

    test("refuses a new power without an aptitude", async () => {
      const { session, ruleset } = await createTestUserAndRuleset(APTITUDES);
      await expectRefusedWith(
        PowersService.createPower(session, ruleset.id, { name: "Orphan Spell", aptitudes: [] }),
        400,
      );
    });

    test("refuses an aptitude that feats already use", async () => {
      const {
        session,
        ruleset,
        aptitudeIds: [wizard, feats],
      } = await createTestUserAndRuleset(APTITUDES);
      await FeatsService.createFeat(session, ruleset.id, { name: "Power Attack", aptitudeIds: [feats] });
      await expectRefusedWith(
        PowersService.createPower(session, ruleset.id, { name: "Feat Spell", aptitudes: [{ id: feats }] }),
        409,
      );

      const power = await PowersService.createPower(session, ruleset.id, {
        name: "Wizard Spell",
        aptitudes: [{ id: wizard }],
      });
      await expectRefusedWith(
        PowersService.updatePower(session, ruleset.id, power.id, {
          name: "Wizard Spell",
          aptitudes: [{ id: feats }],
        }),
        409,
      );
    });

    test("copies an inherited power's aptitudes into the fork's copy, leaving the parent's", async () => {
      const {
        user,
        session,
        ruleset: parent,
        aptitudeIds: [wizard, cleric],
      } = await createTestUserAndRuleset(APTITUDES);
      const source = await PowersService.createPower(session, parent.id, {
        name: "Fireball",
        aptitudes: [{ id: wizard, level: 3 }],
      });
      const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });
      expect((await PowersService.getPower(fork.id, source.id)).powersAptitudesInRules).toMatchObject([
        { aptitudeId: wizard, level: 3 },
      ]);

      const copy = await PowersService.updatePower(session, fork.id, source.id, {
        name: "Fireball",
        aptitudes: [{ id: cleric, level: 2 }],
      });
      expect(await linkedAptitudes(copy.id)).toEqual([{ aptitudeId: cleric, level: 2 }]);
      expect(await linkedAptitudes(source.id)).toEqual([{ aptitudeId: wizard, level: 3 }]);
    });
  });

  test("keeps the properties a user added, and the fields an edit leaves out, when the spell's fields change", async () => {
    // Regression: saving the spell fields once replaced every property of the power, then the fields the edit left out.
    const {
      session,
      ruleset,
      aptitudeIds: [wizard],
    } = await createTestUserAndRuleset(APTITUDES);
    const power = await PowersService.createPower(session, ruleset.id, {
      name: "Fireball",
      aptitudes: [{ id: wizard }],
      fields: { school: "Evocation", castingTime: "1 round" },
    });
    await Properties.create(db, { entityId: power.id, entityType: "powers", type: "SIGNATURE_SPELL", value: "true" });

    await PowersService.updatePower(session, ruleset.id, power.id, {
      name: "Fireball",
      fields: { school: "Conjuration" },
    });

    const properties = await Properties.findMany(db, { entityIds: [power.id], entityType: "powers" });
    expect(properties.map(({ type, value }) => ({ type, value })).sort((a, b) => a.type.localeCompare(b.type))).toEqual(
      [
        { type: "SIGNATURE_SPELL", value: "true" },
        { type: SPELL_CASTING_TIME, value: "1 round" },
        { type: SPELL_SCHOOL, value: "Conjuration" },
      ],
    );
  });

  test("deletes a power's aptitude and class-level links with it", async () => {
    const {
      session,
      ruleset,
      aptitudeIds: [wizard],
    } = await createTestUserAndRuleset(APTITUDES);
    const power = await PowersService.createPower(session, ruleset.id, {
      name: "Doomed Spell",
      aptitudes: [{ id: wizard }],
    });
    const { klassLevel } = await createTestKlassLevel(ruleset.id);
    await insertRows(klassLevelPowersInRules, [{ klassLevelId: klassLevel.id, powerId: power.id, aptitudeId: wizard }]);

    await PowersService.deletePower(session, ruleset.id, power.id);

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
    } = await createTestUserAndRuleset(APTITUDES);
    const power = await PowersService.createPower(session, extension.id, {
      name: "Extension Spell",
      aptitudes: [{ id: wizard }],
    });
    const host = await createTestRuleset(user.id, { extensionRulesetIds: [extension.id] });

    const character = await createTestCharacter(user.id, { rulesetId: host.id });
    const { klassLevel } = await createTestKlassLevel(host.id);
    await addCharacterLevel(character.id, klassLevel.id, { powers: [{ powerId: power.id, aptitudeId: wizard }] });

    await expectRefusedWith(PowersService.deletePower(session, extension.id, power.id), 409);
  });
});
