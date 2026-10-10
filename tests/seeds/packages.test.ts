import { expect, test } from "bun:test";

import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

import { ANIMAL_COMPANIONS } from "@/content/dnd3.5/data/bonds/animalCompanions.ts";
import { FAMILIARS } from "@/content/dnd3.5/data/bonds/familiars.ts";
import { SPECIAL_MOUNTS } from "@/content/dnd3.5/data/bonds/mounts.ts";
import { ALL_CLASSES } from "@/content/dnd3.5/generated/srd/classes/index.ts";
import { ALL_DOMAINS } from "@/content/dnd3.5/generated/srd/domains.ts";
import {
  GOODS,
  MAGIC_ARMOR,
  MAGIC_SHIELDS,
  MAGIC_WEAPONS,
  RINGS,
  RODS,
  STAFFS,
  WONDROUS_ITEMS,
} from "@/content/dnd3.5/generated/srd/items/index.ts";
import { ALL_RACES } from "@/content/dnd3.5/generated/srd/races.ts";
import { ALL_SPELLS } from "@/content/dnd3.5/generated/srd/spells/index.ts";
import { CORE, TEMPLATE_ITEMS } from "@/content/dnd3.5/packages/core.ts";
import { DND35_RULESET_NAME } from "@/content/dnd3.5/rulesetNames.ts";
import { registry } from "@/database/packages/registry.ts";
import {
  entitySnapshotsInRules,
  featsInRules,
  itemsInRules,
  klassesInRules,
  powersInRules,
  racesInRules,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { invalidateSeededRuleset } from "@/tests/support/rulesets.ts";

const BONDS = [FAMILIARS, ANIMAL_COMPANIONS, SPECIAL_MOUNTS];
function sortedNames(rows: { name: string }[]) {
  return rows.map((row) => row.name).sort();
}

/** Renames the seeded system rulesets (the seeds find the core rules by name, and a system ruleset's name is its own). Returns their ids. */
async function renameSeeded() {
  const ids = (
    await db
      .update(rulesetsInRules)
      .set({ name: sql`${rulesetsInRules.name} || ' (seeded)'` })
      .where(eq(rulesetsInRules.system, true))
      .returning({ id: rulesetsInRules.id })
  ).map(({ id }) => id);
  for (const id of ids) invalidateSeededRuleset(id);
  return ids;
}

test("An extension doesn't seed without the core rules", async () => {
  await renameSeeded();
  const extension = registry.find((pkg) => pkg.type === "extension")!;
  expect(extension.seeds[0](db)).rejects.toThrow(`needs ${DND35_RULESET_NAME}, which isn't seeded`);
});

test("Every content package seeds into a database without them, its extensions extending the core rules it seeds", async () => {
  const seeded = await renameSeeded();
  for (const pkg of registry) for (const seed of pkg.seeds) await seed(db);

  const rulesets = await db
    .select()
    .from(rulesetsInRules)
    .where(and(eq(rulesetsInRules.system, true), notInArray(rulesetsInRules.id, seeded)));
  const core = rulesets.find((ruleset) => ruleset.name === DND35_RULESET_NAME)!;
  const extensions = rulesets.filter((ruleset) => ruleset !== core);
  expect(extensions.length).toBe(registry.length - 1);
  for (const extension of extensions)
    expect({ name: extension.name, base: extension.rulesetId }).toEqual({ name: extension.name, base: core.id });

  // The core rules have all their content
  const own = (
    table:
      | typeof featsInRules
      | typeof klassesInRules
      | typeof powersInRules
      | typeof racesInRules
      | typeof itemsInRules,
  ) => db.select({ id: table.id, name: table.name }).from(table).where(eq(table.rulesetId, core.id));
  const coreFeats = await own(featsInRules);
  const corePowers = await own(powersInRules);
  expect(sortedNames(coreFeats)).toEqual(
    [
      ...CORE.feats.map((feat) => feat.name),
      ...ALL_DOMAINS.map((domain) => `${domain.name} Domain`),
      ...BONDS.flatMap((bond) => bond.feats.map((feat) => feat.name)),
    ].sort(),
  );
  expect(sortedNames(await own(klassesInRules))).toEqual(
    [...ALL_CLASSES, ...BONDS.map((bond) => bond.klass)].map((klass) => klass.name).sort(),
  );
  expect(sortedNames(corePowers)).toEqual(ALL_SPELLS.map((spell) => spell.name).sort());
  expect(sortedNames(await own(racesInRules))).toEqual(
    [...ALL_RACES, ...BONDS.flatMap((bond) => bond.races)].map((race) => race.name).sort(),
  );
  expect(sortedNames(await own(itemsInRules))).toEqual(
    [
      ...TEMPLATE_ITEMS,
      ...GOODS,
      ...MAGIC_ARMOR,
      ...MAGIC_SHIELDS,
      ...MAGIC_WEAPONS,
      ...WONDROUS_ITEMS,
      ...RINGS,
      ...RODS,
      ...STAFFS,
    ]
      .map((item) => item.name)
      .sort(),
  );

  // Every base a package seeds holds the template items (its magic armor adds one), which its forks read through their
  // chain: a fork makes none
  const bases = rulesets.filter((ruleset) => ruleset.rulesetId === null);
  expect(bases.map((base) => base.name)).toEqual([DND35_RULESET_NAME]);
  for (const base of bases) {
    const templates = await db
      .select({ name: itemsInRules.name })
      .from(itemsInRules)
      .where(and(eq(itemsInRules.rulesetId, base.id), eq(itemsInRules.isTemplate, true)));
    expect({ base: base.name, templates: sortedNames(templates) }).toEqual({
      base: base.name,
      templates: expect.arrayContaining(sortedNames(TEMPLATE_ITEMS)),
    });
  }

  // What the extensions copy is the new core's
  const snapshots = await db
    .select()
    .from(entitySnapshotsInRules)
    .where(
      inArray(
        entitySnapshotsInRules.rulesetId,
        extensions.map(({ id }) => id),
      ),
    );
  expect(snapshots.length).toBeGreaterThan(0);
  const coreIds = new Set([...coreFeats, ...corePowers].map(({ id }) => id));
  expect(snapshots.filter((snapshot) => !coreIds.has(snapshot.sourceEntityId))).toEqual([]);
}, 60_000);
