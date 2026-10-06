/**
 * A customization names what it belongs to by type and id, with no foreign key. The database deletes it with that
 * row, whatever deletes the row: a service, or a foreign key's cascade (drizzle/0070_customization_cleanup.sql).
 */
import { describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import {
  aptitudesInRules,
  charactersInCharacter,
  featsInRules,
  itemsInRules,
  klassesInRules,
  klassLevelsInRules,
  languagesInRules,
  modifiersInCustomization,
  powersInRules,
  propertiesInCustomization,
  racesInRules,
  requirementsInCustomization,
  rulesetsInRules,
  savesInRules,
  skillsInRules,
} from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import {
  Abilities,
  Aptitudes,
  Feats,
  Items,
  Klasses,
  Languages,
  Modifiers,
  Powers,
  Properties,
  Races,
  Requirements,
  Saves,
  Skills,
  Users,
} from "@/server/repositories/index.ts";
import { AuthenticationService } from "@/server/services/authentication/index.ts";
import { createTestCharacter } from "@/tests/support/characters.ts";
import { createTestKlassLevel } from "@/tests/support/levels.ts";
import { createSeededTestRuleset, createTestRuleset, createTestUserAndRuleset } from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";

type OwnerType = keyof typeof OWNERS;

/** The tables whose rows a customization can belong to, by the type it names them with. */
const OWNERS = {
  aptitudes: aptitudesInRules,
  characters: charactersInCharacter,
  feats: featsInRules,
  items: itemsInRules,
  klass_levels: klassLevelsInRules,
  klasses: klassesInRules,
  languages: languagesInRules,
  modifiers: modifiersInCustomization,
  powers: powersInRules,
  races: racesInRules,
  rulesets: rulesetsInRules,
  saves: savesInRules,
  skills: skillsInRules,
};

const strengthBonus = { target: "abilities.strength.misc", value: "2", valueType: "number", operator: "add" };

/** The customizations whose owner is gone, or of a type no table above holds. */
async function orphans() {
  const owners = sql.join(
    Object.entries(OWNERS).map(([type, table]) => sql`SELECT ${type}::text AS type, id FROM ${table}`),
    sql` UNION ALL `,
  );
  const { rows } = await db.execute(sql`
    WITH owners AS (${owners}),
    customizations AS (
      SELECT 'modifiers' AS kind, id, source_type AS type, source_id AS owner_id FROM ${modifiersInCustomization}
      UNION ALL SELECT 'requirements', id, entity_type, entity_id FROM ${requirementsInCustomization}
      UNION ALL SELECT 'properties', id, entity_type, entity_id FROM ${propertiesInCustomization}
    )
    SELECT kind, type, id FROM customizations c
    WHERE NOT EXISTS (SELECT FROM owners o WHERE o.type = c.type AND o.id = c.owner_id)
  `);
  return rows;
}

/** Gives the row a modifier with a requirement of its own, a requirement and a property. */
async function customize(type: OwnerType, id: string) {
  const [modifier] = await Modifiers.create(db, { ...strengthBonus, sourceId: id, sourceType: type });
  await Requirements.create(db, {
    entityId: modifier.id,
    entityType: "modifiers",
    level: "1",
    chainingOperator: "and",
  });
  await Requirements.create(db, { entityId: id, entityType: type, level: "1", chainingOperator: "and" });
  await Properties.create(db, { entityId: id, entityType: type, type: "NOTE", value: "doomed" });
}

/** A new row of the type, in a ruleset of `userId`'s. */
async function createOwner(type: OwnerType, userId: string, rulesetId: string): Promise<string> {
  const name = "Doomed";
  switch (type) {
    case "aptitudes":
      return (await Aptitudes.create(db, { name, rulesetId }))[0].id;
    case "characters":
      return (await createTestCharacter(userId)).id;
    case "feats":
      return (await Feats.create(db, { name, rulesetId }))[0].id;
    case "items":
      return (await Items.create(db, { name, rulesetId }))[0].id;
    case "klass_levels":
      return (await createTestKlassLevel(rulesetId)).klassLevel.id;
    case "klasses":
      return (await Klasses.create(db, { name, rulesetId, hd: 8 }))[0].id;
    case "languages":
      return (await Languages.create(db, { name, rulesetId, type: "Standard" }))[0].id;
    case "modifiers": {
      const [feat] = await Feats.create(db, { name, rulesetId });
      return (await Modifiers.create(db, { ...strengthBonus, sourceId: feat.id, sourceType: "feats" }))[0].id;
    }
    case "powers":
      return (await Powers.create(db, { name, rulesetId }))[0].id;
    case "races":
      return (await Races.create(db, { name, rulesetId, size: "Medium", baseSpeed: 30 }))[0].id;
    case "rulesets":
      return (await createTestRuleset(userId)).id;
    case "saves":
    case "skills": {
      const [ability] = await Abilities.create(db, { name: "Strength", description: "Strength", rulesetId });
      if (type === "saves") return (await Saves.create(db, { name, rulesetId, abilityId: ability.id }))[0].id;
      return (await Skills.create(db, { name, rulesetId, primaryAbilityId: ability.id }))[0].id;
    }
  }
}

describe("customization cleanup", () => {
  test("the seeded database has no customization without its owner", async () => {
    expect(await orphans()).toEqual([]);
  });

  test.each(Object.keys(OWNERS) as OwnerType[])("deletes a deleted %s row's customizations", async (type) => {
    const { user, ruleset } = await createTestUserAndRuleset();
    const id = await createOwner(type, user.id, ruleset.id);
    await customize(type, id);

    await db.execute(sql`DELETE FROM ${OWNERS[type]} WHERE id = ${id}`);
    expect(await orphans()).toEqual([]);
  });

  test("deletes a class's levels' customizations with the class", async () => {
    const { ruleset } = await createTestUserAndRuleset();
    const { klass, klassLevel } = await createTestKlassLevel(ruleset.id);
    await customize("klass_levels", klassLevel.id);

    // The class's levels go through their foreign key's cascade
    await db.execute(sql`DELETE FROM ${klassesInRules} WHERE id = ${klass.id}`);
    expect(await orphans()).toEqual([]);
  });

  test("deletes a demo account's customizations with its rulesets and characters", async () => {
    const { user } = await AuthenticationService.startDemo();
    // The fork comes with copies of the seeded ruleset's properties
    const fork = await createSeededTestRuleset(user.id);
    const { klassLevel } = await createTestKlassLevel(fork.id);
    const character = await createTestCharacter(user.id, { rulesetId: fork.id });
    await customize("feats", await createOwner("feats", user.id, fork.id));
    await customize("klass_levels", klassLevel.id);
    await customize("characters", character.id);
    expect(await Properties.findMany(db, { entityIds: [fork.id], entityType: "rulesets" })).not.toEqual([]);

    // Signing out purges a demo account, and the foreign keys' cascades its rulesets and characters
    await AuthenticationService.signOut(makeSession(user.id));
    expect(await Users.findOne(db, { id: user.id })).toBeUndefined();
    expect(await orphans()).toEqual([]);
  });
});
