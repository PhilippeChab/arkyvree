/**
 * A modifier or a requirement names what it belongs to by type and id, with no foreign key. The database deletes it with
 * that row, whatever deletes the row: a service, or a foreign key's cascade (drizzle/0070_customization_cleanup.sql, and
 * drizzle/0080_generic-tables.sql's for an entity). An entity's fields' rows and its links go by their foreign keys.
 */

import { describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import {
  charactersInCharacter,
  entitiesInRules,
  modifiersInCustomization,
  requirementsInCustomization,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import type { FieldsWrite } from "@/engine/index.ts";
import {
  type Aptitude,
  type Feat,
  type Item,
  type Klass,
  type Language,
  type Race,
  type RulesetAbility,
  type RulesetSave,
  type Skill,
  type Spell,
} from "@/engine/rulesets/dnd3.5/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, Modifiers, Users } from "@/server/repositories/index.ts";
import { AuthenticationService } from "@/server/services/authentication/index.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { customize, STRENGTH_BONUS } from "@/tests/support/dnd3.5/customizations.ts";
import { createTestKlassLevel } from "@/tests/support/dnd3.5/levels.ts";
import { createTestUserAndRuleset } from "@/tests/support/dnd3.5/rulesets.ts";
import { findFormValues } from "@/tests/support/ownerValues.ts";
import { createSeededTestRuleset, createTestRuleset } from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";
import {
  CLASS_HD,
  LANGUAGE_TYPE,
  RACE_BASE_SPEED,
  RACE_SIZE,
  RULESET_FEAT_ADVANCEMENT,
} from "@/vocabulary/dnd3.5/fields/index.ts";

type OwnerType = keyof typeof OWNERS;

/** The tables whose rows a customization can belong to, by the type it names them with: an entity's, every kind's. */
const OWNERS = {
  aptitudes: entitiesInRules,
  characters: charactersInCharacter,
  feats: entitiesInRules,
  items: entitiesInRules,
  class_levels: entitiesInRules,
  classes: entitiesInRules,
  languages: entitiesInRules,
  modifiers: modifiersInCustomization,
  spells: entitiesInRules,
  races: entitiesInRules,
  rulesets: rulesetsInRules,
  saves: entitiesInRules,
  skills: entitiesInRules,
} satisfies Record<string, PgTable>;

/**
 * The fields and links given a row that isn't an entity, which `customize` picks only for an entity's kind: a ruleset
 * a setting of its own, a character none (its fields are its row's).
 */
const VALUES: Record<string, FieldsWrite | null> = {
  characters: null,
  rulesets: { fields: { [RULESET_FEAT_ADVANCEMENT]: ["doomed"] }, links: {} },
};

/** A new row of the type, in a ruleset of `userId`'s. */
async function createOwner(type: OwnerType, userId: string, rulesetId: string): Promise<string> {
  const name = "Doomed";
  switch (type) {
    case "aptitudes":
      return (await Entities.create<Aptitude>(db, "aptitudes", { name, rulesetId }))[0].id;
    case "characters":
      return (await createTestCharacter(userId)).id;
    case "feats":
      return (await Entities.create<Feat>(db, "feats", { name, rulesetId }))[0].id;
    case "items":
      return (await Entities.create<Item>(db, "items", { name, rulesetId }))[0].id;
    case "class_levels":
      return (await createTestKlassLevel(rulesetId)).klassLevel.id;
    case "classes":
      return (await Entities.create<Klass>(db, "classes", { name, rulesetId, fields: { [CLASS_HD]: 8 } }))[0].id;
    case "languages":
      return (
        await Entities.create<Language>(db, "languages", { name, rulesetId, fields: { [LANGUAGE_TYPE]: "Standard" } })
      )[0].id;
    case "modifiers": {
      const [feat] = await Entities.create<Feat>(db, "feats", { name, rulesetId });
      return (await Modifiers.create(db, { ...STRENGTH_BONUS, sourceId: feat.id, sourceType: "feats" }))[0].id;
    }
    case "spells":
      return (await Entities.create<Spell>(db, "spells", { name, rulesetId }))[0].id;
    case "races":
      return (
        await Entities.create<Race>(db, "races", {
          name,
          rulesetId,
          fields: { [RACE_SIZE]: "Medium", [RACE_BASE_SPEED]: 30 },
        })
      )[0].id;
    case "rulesets":
      return (await createTestRuleset(userId)).id;
    case "saves":
    case "skills": {
      const [ability] = await Entities.create<RulesetAbility>(db, "abilities", {
        name: "Strength",
        description: "Strength",
        rulesetId,
      });
      if (type === "saves") {
        return (
          await Entities.create<RulesetSave>(db, "saves", { name, rulesetId, links: { keyAbility: ability.id } })
        )[0].id;
      }
      return (await Entities.create<Skill>(db, "skills", { name, rulesetId, links: { keyAbility: ability.id } }))[0].id;
    }
  }
}

/** Customizes a row of the type (`customize`), with its type's fields and links. */
async function customizeOwner(type: string, id: string) {
  return await customize(type, id, type in VALUES ? { values: VALUES[type] } : {});
}

/** The customizations whose owner is gone, or of a type no table above holds. */
async function orphans() {
  const owners = sql.join(
    Object.entries(OWNERS).map(([type, table]) =>
      table === entitiesInRules
        ? sql`SELECT type, id FROM ${table} WHERE type = ${type}`
        : sql`SELECT ${type}::text AS type, id FROM ${table}`,
    ),
    sql` UNION ALL `,
  );
  const { rows } = await db.execute(sql`
    WITH owners AS (${owners}),
    customizations AS (
      SELECT 'modifiers' AS kind, id, source_type AS type, source_id AS owner_id FROM ${modifiersInCustomization}
      UNION ALL SELECT 'requirements', id, entity_type, entity_id FROM ${requirementsInCustomization}
    )
    SELECT kind, type, id FROM customizations c
    WHERE NOT EXISTS (SELECT FROM owners o WHERE o.type = c.type AND o.id = c.owner_id)
  `);
  return rows;
}

describe("customization cleanup", () => {
  test("the seeded database has no customization without its owner", async () => {
    expect(await orphans()).toEqual([]);
  });

  test.each(Object.keys(OWNERS) as OwnerType[])("deletes a deleted %s row's customizations", async (type) => {
    const { user, ruleset } = await createTestUserAndRuleset();
    const id = await createOwner(type, user.id, ruleset.id);
    await customizeOwner(type, id);

    await db.execute(sql`DELETE FROM ${OWNERS[type]} WHERE id = ${id}`);
    expect(await orphans()).toEqual([]);
  });

  test("deletes a class's levels' customizations with the class", async () => {
    const { ruleset } = await createTestUserAndRuleset();
    const { klass, klassLevel } = await createTestKlassLevel(ruleset.id);
    await customize("class_levels", klassLevel.id);

    // The class's levels go through their foreign key's cascade
    await db.execute(sql`DELETE FROM ${entitiesInRules} WHERE id = ${klass.id}`);
    expect(await orphans()).toEqual([]);
  });

  test("deletes a demo account's customizations with its rulesets and characters", async () => {
    const { user } = await AuthenticationService.startDemo();
    // The fork comes with a copy of the seeded ruleset's Settings
    const fork = await createSeededTestRuleset(user.id);
    const { klassLevel } = await createTestKlassLevel(fork.id);
    const character = await createTestCharacter(user.id, { rulesetId: fork.id });
    await customize("feats", await createOwner("feats", user.id, fork.id));
    await customize("class_levels", klassLevel.id);
    await customizeOwner("characters", character.id);
    expect(await findFormValues("rulesets", fork.id)).not.toEqual({ fields: {}, links: {} });

    // Signing out purges a demo account, and the foreign keys' cascades its rulesets and characters
    await AuthenticationService.signOut(makeSession(user.id));
    expect(await Users.findOne(db, { id: user.id })).toBeUndefined();
    expect(await orphans()).toEqual([]);
  });
});
