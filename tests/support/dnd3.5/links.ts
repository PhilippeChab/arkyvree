/**
 * 3.5's links written and read as a save and the view do (`EntityLinks`), by role: a feat's or a spell's lists
 * (`listedIn`), a class level's grants (`grants`) and base bonuses (`baseBonus`), a class's skills (`classSkill`).
 */

import type { Db } from "@/drizzle/database.ts";
import { EntityLinks } from "@/server/repositories/index.ts";

/** A class level's base bonuses to saves (`classLevelId`, `bonuses`: each a save, `toId`, and its bonus, `amount`). */
export async function addBaseBonuses(db: Db, classLevelId: string, bonuses: { amount: number; toId: string }[]) {
  return await EntityLinks.createMany(
    db,
    bonuses.map(({ amount, toId }) => ({
      role: "baseBonus",
      fromId: classLevelId,
      fromType: "class-levels",
      toId,
      toType: "saves",
      amount,
    })),
  );
}

/** A class's skills (`classId`, `skillIds`): its `classSkill` links. */
export async function addClassSkills(db: Db, classId: string, skillIds: string[]) {
  return await EntityLinks.createMany(
    db,
    skillIds.map((toId) => ({ role: "classSkill", fromId: classId, fromType: "classes", toId, toType: "skills" })),
  );
}

/**
 * A class level's grants of feats or spells (`toType`): each its feat or spell (`toId`), through its pool (`viaId`),
 * free unless it says (`free`), as a class level's form and the seeder write them. Only a spell grant's `free` is read:
 * a free one makes no room in its pool and has its requirements unchecked. No form nor seed writes a spell grant: the
 * storage declares the role (`Dnd35Storage`), which the view, copy-on-write, deletes and level-ups read, and the tests
 * that write one test those.
 */
export async function addGrants(
  db: Db,
  classLevelId: string,
  toType: "feats" | "spells",
  grants: { free?: boolean; toId: string; viaId: string }[],
) {
  return await EntityLinks.createMany(
    db,
    grants.map(({ free = true, toId, viaId }) => ({
      role: "grants",
      fromId: classLevelId,
      fromType: "class-levels",
      toId,
      toType,
      viaId,
      free,
    })),
  );
}

/**
 * Feats' or spells' lists (`type`, `listings`: each its feat or spell, `fromId`, its list, `toId`, and a spell's level
 * there, `tier`): their `listedIn` links.
 */
export async function addListings(
  db: Db,
  type: "feats" | "spells",
  listings: { fromId: string; tier?: number | null; toId: string }[],
) {
  return await EntityLinks.createMany(
    db,
    listings.map(({ fromId, tier, toId }) => ({
      role: "listedIn",
      fromId,
      fromType: type,
      toId,
      toType: "aptitudes",
      tier: tier ?? null,
    })),
  );
}

/**
 * A feat's or a spell's lists (`type`, `entityId`, `lists`: each its list, `toId`, and a spell's level there, `tier`):
 * its `listedIn` links.
 */
export async function addLists(
  db: Db,
  type: "feats" | "spells",
  entityId: string,
  lists: { tier?: number | null; toId: string }[],
) {
  return await addListings(
    db,
    type,
    lists.map((list) => ({ ...list, fromId: entityId })),
  );
}

/** The grants of class levels (`classLevelIds`) as stored, of feats or spells (`toType`) when it says. */
export async function findGrants(db: Db, classLevelIds: string[], toType?: "feats" | "spells") {
  const grants = await EntityLinks.findMany(db, { fromIds: classLevelIds, role: "grants" });
  return toType ? grants.filter((grant) => grant.toType === toType) : grants;
}

/** The lists feats or spells are on (`entityIds`) as stored: their `listedIn` links. */
export async function findLists(db: Db, entityIds: string[]) {
  return await EntityLinks.findMany(db, { fromIds: entityIds, role: "listedIn" });
}
