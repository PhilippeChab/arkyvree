import { describe, expect, test } from "bun:test";

import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Activities, EntityLinks } from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { addCharacterLevel, createTestClassLevel } from "@/tests/support/dnd3.5/levels.ts";
import { addGrants, findLists } from "@/tests/support/dnd3.5/links.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import { findFormValues, writeFieldValues } from "@/tests/support/ownerValues.ts";
import { createSeededTestRuleset, createTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import {
  SPELL_CASTING_TIME,
  SPELL_DESCRIPTOR,
  SPELL_SAVE_EFFECT,
  SPELL_SCHOOL,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** The aptitudes of the test's ruleset. */
const APTITUDES = ["Wizard", "Cleric", "Druid"];

function sorted(links: { aptitudeId: string; level: number | null }[]) {
  return [...links].sort((a, b) => a.aptitudeId.localeCompare(b.aptitudeId));
}

async function linkedAptitudes(spellId: string) {
  return (await findLists(db, [spellId]))
    .map(({ tier, toId }) => ({ aptitudeId: toId, level: tier }))
    .sort((a, b) => a.aptitudeId.localeCompare(b.aptitudeId));
}

// CRUD, ownership and copy-on-write are covered for every entity in EntityServices.test.ts,
// and the spell fields a spell generates in GeneratedFeats.test.ts.
describe("EntitiesService: spells", () => {
  test("keeps a spell's save effect through an edit that leaves it out, and clears it with an empty one", async () => {
    const {
      session,
      ruleset,
      aptitudeIds: [wizard],
    } = await createTestUserAndRuleset(APTITUDES);
    const spell = await EntitiesService.createEntity(session, ruleset.id, "spells", {
      name: "Hold Person",
      fields: { [SPELL_SAVE_EFFECT]: "negates" },
      links: { listedIn: [{ toId: wizard }] },
    });
    expect(
      await EntitiesService.updateEntity(session, ruleset.id, "spells", spell.id, { name: "Hold Person" }),
    ).toMatchObject({
      fields: { [SPELL_SAVE_EFFECT]: "negates" },
    });
    expect(
      (
        await EntitiesService.updateEntity(session, ruleset.id, "spells", spell.id, {
          name: "Hold Person",
          fields: { [SPELL_SAVE_EFFECT]: "" },
        })
      ).fields,
    ).toMatchObject({ [SPELL_SAVE_EFFECT]: null });
    expect(await findFormValues("spells", spell.id)).toEqual({ fields: {}, links: {} });
  });

  test("records the columns an edit changes, never what its form sends that it doesn't write", async () => {
    const {
      session,
      ruleset,
      aptitudeIds: [wizard],
    } = await createTestUserAndRuleset(APTITUDES);
    const spell = await EntitiesService.createEntity(session, ruleset.id, "spells", {
      name: "Shield",
      links: { listedIn: [{ toId: wizard }] },
    });
    // A form's empty save effect is none, as the spell's is; the feat's mark and the ruleset aren't a form's to write
    const form = {
      name: "Shield",
      fields: { [SPELL_SAVE_EFFECT]: "" },
      generated: true,
      rulesetId: "00000000-0000-0000-0000-000000000000",
    };
    await EntitiesService.updateEntity(session, ruleset.id, "spells", spell.id, form);
    await EntitiesService.updateEntity(session, ruleset.id, "spells", spell.id, {
      name: "Shield",
      fields: { [SPELL_SAVE_EFFECT]: "negates" },
    });
    const { items } = await Activities.findPage(
      db,
      { userId: session.userId, targetType: "spells" },
      { limit: 10, page: 1 },
    );
    const updates = items.filter((activity) => activity.type === "updateSpell");
    expect(
      updates.map((activity) => activity.data).sort((a, b) => JSON.stringify(a).length - JSON.stringify(b).length),
    ).toEqual([
      expect.objectContaining({ changedFields: [] }),
      expect.objectContaining({ changedFields: [{ field: SPELL_SAVE_EFFECT, label: "Save Effect", to: "negates" }] }),
    ]);
  });

  describe("aptitudes", () => {
    test("links a spell to its aptitudes at a level; an update replaces them, keeps them when it omits them, and can clear them", async () => {
      const {
        session,
        ruleset,
        aptitudeIds: [wizard, cleric, druid],
      } = await createTestUserAndRuleset(APTITUDES);
      const spell = await EntitiesService.createEntity(session, ruleset.id, "spells", {
        name: "Fireball",
        links: { listedIn: [{ toId: wizard, tier: 3 }, { toId: cleric }] },
      });
      expect(await linkedAptitudes(spell.id)).toEqual(
        sorted([
          { aptitudeId: wizard, level: 3 },
          { aptitudeId: cleric, level: null },
        ]),
      );

      await EntitiesService.updateEntity(session, ruleset.id, "spells", spell.id, {
        name: "Fireball",
        links: { listedIn: [{ toId: druid, tier: 4 }] },
      });
      expect(await linkedAptitudes(spell.id)).toEqual([{ aptitudeId: druid, level: 4 }]);

      await EntitiesService.updateEntity(session, ruleset.id, "spells", spell.id, {
        name: "Fireball",
        description: "Renamed only",
      });
      expect(await linkedAptitudes(spell.id)).toEqual([{ aptitudeId: druid, level: 4 }]);

      await EntitiesService.updateEntity(session, ruleset.id, "spells", spell.id, {
        name: "Fireball",
        links: { listedIn: [] },
      });
      expect(await linkedAptitudes(spell.id)).toEqual([]);
    });

    test("links a spell to the lists it names only: a school's specialist list as a domain's", async () => {
      // A new evocation spell on the wizard's list is on the evocation specialist's only when it names it
      const { user, session } = await createTestUser();
      const fork = await createSeededTestRuleset(user.id);
      const { aptMap } = await getSeedCtx();
      const [wizard, specialist] = [aptMap["Wizard Spells"], aptMap["Evocation Specialist Spells"]];
      const wizardOnly = await EntitiesService.createEntity(session, fork.id, "spells", {
        name: "Test Bolt",
        fields: { [SPELL_SCHOOL]: "Evocation" },
        links: { listedIn: [{ toId: wizard, tier: 3 }] },
      });
      expect(await linkedAptitudes(wizardOnly.id)).toEqual([{ aptitudeId: wizard, level: 3 }]);

      const both = await EntitiesService.createEntity(session, fork.id, "spells", {
        name: "Test Blast",
        fields: { [SPELL_SCHOOL]: "Evocation" },
        links: {
          listedIn: [
            { toId: wizard, tier: 3 },
            { toId: specialist, tier: 3 },
          ],
        },
      });
      expect(await linkedAptitudes(both.id)).toEqual(
        sorted([
          { aptitudeId: wizard, level: 3 },
          { aptitudeId: specialist, level: 3 },
        ]),
      );
    });

    test("refuses a new spell without an aptitude", async () => {
      const { session, ruleset } = await createTestUserAndRuleset(APTITUDES);
      await expectRefusedWith(
        EntitiesService.createEntity(session, ruleset.id, "spells", { name: "Orphan Spell", links: { listedIn: [] } }),
        400,
      );
    });

    test("refuses an aptitude that feats already use", async () => {
      const {
        session,
        ruleset,
        aptitudeIds: [wizard, feats],
      } = await createTestUserAndRuleset(APTITUDES);
      await EntitiesService.createEntity(session, ruleset.id, "feats", {
        name: "Power Attack",
        links: { listedIn: [{ toId: feats }] },
      });
      await expectRefusedWith(
        EntitiesService.createEntity(session, ruleset.id, "spells", {
          name: "Feat Spell",
          links: { listedIn: [{ toId: feats }] },
        }),
        409,
      );

      const spell = await EntitiesService.createEntity(session, ruleset.id, "spells", {
        name: "Wizard Spell",
        links: { listedIn: [{ toId: wizard }] },
      });
      await expectRefusedWith(
        EntitiesService.updateEntity(session, ruleset.id, "spells", spell.id, {
          name: "Wizard Spell",
          links: { listedIn: [{ toId: feats }] },
        }),
        409,
      );
    });

    test("copies an inherited spell's aptitudes into the fork's copy, leaving the parent's", async () => {
      const {
        user,
        session,
        ruleset: parent,
        aptitudeIds: [wizard, cleric],
      } = await createTestUserAndRuleset(APTITUDES);
      const source = await EntitiesService.createEntity(session, parent.id, "spells", {
        name: "Fireball",
        links: { listedIn: [{ toId: wizard, tier: 3 }] },
      });
      const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });
      expect((await EntitiesService.getEntity(fork.id, "spells", source.id)).links).toMatchObject([
        { toId: wizard, tier: 3 },
      ]);

      const copy = await EntitiesService.updateEntity(session, fork.id, "spells", source.id, {
        name: "Fireball",
        links: { listedIn: [{ toId: cleric, tier: 2 }] },
      });
      expect(await linkedAptitudes(copy.id)).toEqual([{ aptitudeId: cleric, level: 2 }]);
      expect(await linkedAptitudes(source.id)).toEqual([{ aptitudeId: wizard, level: 3 }]);
    });
  });

  test("keeps the values a user added, and the fields an edit leaves out, when the spell's fields change", async () => {
    // Regression: saving the spell fields once replaced every stored value, then the fields the edit left out.
    const {
      session,
      ruleset,
      aptitudeIds: [wizard],
    } = await createTestUserAndRuleset(APTITUDES);
    const spell = await EntitiesService.createEntity(session, ruleset.id, "spells", {
      name: "Fireball",
      fields: { [SPELL_SCHOOL]: "Evocation", [SPELL_CASTING_TIME]: "1 round" },
      links: { listedIn: [{ toId: wizard }] },
    });
    await writeFieldValues("spells", spell.id, [[SPELL_DESCRIPTOR, "Fire"]]);
    // A value a user added, written past the services, after the create read the ruleset's view
    RulesetViews.invalidate(ruleset.id);

    await EntitiesService.updateEntity(session, ruleset.id, "spells", spell.id, {
      name: "Fireball",
      fields: { [SPELL_SCHOOL]: "Conjuration" },
    });

    expect((await findFormValues("spells", spell.id)).fields).toEqual({
      [SPELL_SCHOOL]: ["Conjuration"],
      [SPELL_DESCRIPTOR]: ["Fire"],
      [SPELL_CASTING_TIME]: ["1 round"],
    });
  });

  test("deletes a spell's aptitude and class-level links with it", async () => {
    const {
      session,
      ruleset,
      aptitudeIds: [wizard],
    } = await createTestUserAndRuleset(APTITUDES);
    const spell = await EntitiesService.createEntity(session, ruleset.id, "spells", {
      name: "Doomed Spell",
      links: { listedIn: [{ toId: wizard }] },
    });
    const { classLevel } = await createTestClassLevel(ruleset.id);
    await addGrants(db, classLevel.id, "spells", [{ toId: spell.id, aptitudeId: wizard }]);

    await EntitiesService.deleteEntity(session, ruleset.id, "spells", spell.id);

    expect(await linkedAptitudes(spell.id)).toEqual([]);
    // A grant's spell is its link's to-entity
    expect(await EntityLinks.findMany(db, { fromType: "class-levels", role: "grants", toIds: [spell.id] })).toEqual([]);
  });

  test("refuses to delete a spell a character picked, even through a ruleset using it as an extension", async () => {
    const {
      user,
      session,
      ruleset: extension,
      aptitudeIds: [wizard],
    } = await createTestUserAndRuleset(APTITUDES);
    const spell = await EntitiesService.createEntity(session, extension.id, "spells", {
      name: "Extension Spell",
      links: { listedIn: [{ toId: wizard }] },
    });
    const host = await createTestRuleset(user.id, { extensionRulesetIds: [extension.id] });

    const character = await createTestCharacter(user.id, { rulesetId: host.id });
    const { classLevel } = await createTestClassLevel(host.id);
    await addCharacterLevel(character.id, classLevel.id, { spells: { [wizard]: [spell.id] } });

    await expectRefusedWith(EntitiesService.deleteEntity(session, extension.id, "spells", spell.id), 409);
  });
});
