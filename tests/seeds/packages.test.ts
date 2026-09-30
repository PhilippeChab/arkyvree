import { expect, test } from "bun:test";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { ANIMAL_COMPANIONS } from "@/database/packages/dnd35/content/animalCompanions.ts";
import { FAMILIARS } from "@/database/packages/dnd35/content/familiars.ts";
import { SPECIAL_MOUNTS } from "@/database/packages/dnd35/content/mounts.ts";
import { DND35_RULESET_NAME } from "@/database/packages/dnd35/names.ts";
import { TEMPLATE_ITEMS } from "@/database/packages/dnd35/seed/items.ts";
import { ALL_CLASSES } from "@/database/packages/dnd35-from-parser/generated/srd/classes/index.ts";
import { ALL_DOMAINS } from "@/database/packages/dnd35-from-parser/generated/srd/domains/data.ts";
import { ALL_FEATS } from "@/database/packages/dnd35-from-parser/generated/srd/feats/index.ts";
import { GOODS, MAGIC_ARMOR, MAGIC_SHIELDS, MAGIC_WEAPONS, RINGS, RODS, STAFFS, WONDROUS_ITEMS } from "@/database/packages/dnd35-from-parser/generated/srd/items/index.ts";
import { ALL_RACES } from "@/database/packages/dnd35-from-parser/generated/srd/races/data.ts";
import { ALL_SPELLS } from "@/database/packages/dnd35-from-parser/generated/srd/spells/index.ts";
import { registry } from "@/database/packages/registry.ts";
import { entitySnapshotsInRules, featsInRules, itemsInRules, klassesInRules, powersInRules, racesInRules, rulesetsInRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";

const BONDS = [FAMILIARS, ANIMAL_COMPANIONS, SPECIAL_MOUNTS];
const namesOf = (rows: { name: string }[]) => rows.map((row) => row.name).sort();

/** Renames the seeded system rulesets (the seeds find the core rules by name, and a system ruleset's name is its own). Returns their ids. */
const renameSeeded = async () => (await db.update(rulesetsInRules).set({ name: sql`${rulesetsInRules.name} || ' (seeded)'` })
  .where(eq(rulesetsInRules.system, true)).returning({ id: rulesetsInRules.id })).map(({ id }) => id);

test("An extension doesn't seed without the core rules", async () => {
  await renameSeeded();
  const extension = registry.find((pkg) => pkg.type === "extension")!;
  await expect(extension.seeds[0](db)).rejects.toThrow(`extends ${DND35_RULESET_NAME}, which isn't seeded`);
});

test("Every content package seeds into a database without them, its extensions extending the core rules it seeds", async () => {
  const seeded = await renameSeeded();
  for (const pkg of registry) for (const seed of pkg.seeds) await seed(db);

  const rulesets = await db.select().from(rulesetsInRules)
    .where(and(eq(rulesetsInRules.system, true), notInArray(rulesetsInRules.id, seeded)));
  const core = rulesets.find((ruleset) => ruleset.name === DND35_RULESET_NAME)!;
  const extensions = rulesets.filter((ruleset) => ruleset !== core);
  expect(extensions.length).toBe(registry.length - 1);
  for (const extension of extensions) expect({ name: extension.name, base: extension.rulesetId }).toEqual({ name: extension.name, base: core.id });

  // The core rules have all their content
  const own = (table: typeof featsInRules | typeof klassesInRules | typeof powersInRules | typeof racesInRules | typeof itemsInRules) =>
    db.select({ id: table.id, name: table.name }).from(table).where(eq(table.rulesetId, core.id));
  const coreFeats = await own(featsInRules);
  const corePowers = await own(powersInRules);
  expect(namesOf(coreFeats)).toEqual([...ALL_FEATS.map((feat) => feat.name), ...ALL_DOMAINS.map((domain) => `${domain.name} Domain`), ...BONDS.flatMap((bond) => bond.feats.map((feat) => feat.name))].sort());
  expect(namesOf(await own(klassesInRules))).toEqual([...ALL_CLASSES, ...BONDS.map((bond) => bond.klass)].map((klass) => klass.name).sort());
  expect(namesOf(corePowers)).toEqual(ALL_SPELLS.map((spell) => spell.name).sort());
  expect(namesOf(await own(racesInRules))).toEqual([...ALL_RACES, ...BONDS.flatMap((bond) => bond.races)].map((race) => race.name).sort());
  expect(namesOf(await own(itemsInRules)))
    .toEqual([...TEMPLATE_ITEMS, ...GOODS, ...MAGIC_ARMOR, ...MAGIC_SHIELDS, ...MAGIC_WEAPONS, ...WONDROUS_ITEMS, ...RINGS, ...RODS, ...STAFFS].map((item) => item.name).sort());

  // What the extensions copy is the new core's
  const snapshots = await db.select().from(entitySnapshotsInRules).where(inArray(entitySnapshotsInRules.rulesetId, extensions.map(({ id }) => id)));
  expect(snapshots.length).toBeGreaterThan(0);
  const coreIds = new Set([...coreFeats, ...corePowers].map(({ id }) => id));
  expect(snapshots.filter((snapshot) => !coreIds.has(snapshot.sourceEntityId))).toEqual([]);
}, 60_000);
