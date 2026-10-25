/**
 * 3.5's links written and read as a save and the view do (`EntityLinks`), by role: a feat's or a spell's lists
 * (`listedIn`), a class level's grants (`grants`) and base bonuses (`baseBonus`), a class's skills (`classSkill`).
 */

import type { Db } from "@/drizzle/database.ts";
import { EntityLinks } from "@/server/repositories/index.ts";

/** A class level's base bonuses to saves (`klassLevelId`, `bonuses`): its `baseBonus` links. */
export async function addBaseBonuses(db: Db, klassLevelId: string, bonuses: { base: number; saveId: string }[]) {
  return await EntityLinks.createMany(
    db,
    bonuses.map(({ base, saveId }) => ({
      role: "baseBonus",
      fromId: klassLevelId,
      fromType: "class_levels",
      toId: saveId,
      toType: "saves",
      amount: base,
    })),
  );
}

/** A class's skills (`klassId`, `skillIds`): its `classSkill` links. */
export async function addClassSkills(db: Db, klassId: string, skillIds: string[]) {
  return await EntityLinks.createMany(
    db,
    skillIds.map((toId) => ({ role: "classSkill", fromId: klassId, fromType: "classes", toId, toType: "skills" })),
  );
}

/** A class level's grants of feats or spells (`toType`), each through its pool, free when it says. */
export async function addGrants(
  db: Db,
  klassLevelId: string,
  toType: "feats" | "spells",
  grants: { aptitudeId: string; free?: boolean; toId: string }[],
) {
  return await EntityLinks.createMany(
    db,
    grants.map(({ aptitudeId, free = false, toId }) => ({
      role: "grants",
      fromId: klassLevelId,
      fromType: "class_levels",
      toId,
      toType,
      viaId: aptitudeId,
      free,
    })),
  );
}

/** Feats' or spells' lists (`type`, `listings`: each its entity's): their `listedIn` links, a spell's at its level. */
export async function addListings(
  db: Db,
  type: "feats" | "spells",
  listings: { aptitudeId: string; entityId: string; level?: number | null }[],
) {
  return await EntityLinks.createMany(
    db,
    listings.map(({ aptitudeId, entityId, level }) => ({
      role: "listedIn",
      fromId: entityId,
      fromType: type,
      toId: aptitudeId,
      toType: "aptitudes",
      tier: level ?? null,
    })),
  );
}

/** A feat's or a spell's lists (`type`, `entityId`): its `listedIn` links, a spell's each at its level. */
export async function addLists(
  db: Db,
  type: "feats" | "spells",
  entityId: string,
  lists: { aptitudeId: string; level?: number | null }[],
) {
  return await addListings(
    db,
    type,
    lists.map((list) => ({ ...list, entityId })),
  );
}

/** The grants of class levels (`klassLevelIds`) as stored, of feats or spells (`toType`) when it says. */
export async function findGrants(db: Db, klassLevelIds: string[], toType?: "feats" | "spells") {
  const grants = await EntityLinks.findMany(db, { fromIds: klassLevelIds, role: "grants" });
  return toType ? grants.filter((grant) => grant.toType === toType) : grants;
}

/** The lists feats or spells are on (`entityIds`) as stored: their `listedIn` links. */
export async function findLists(db: Db, entityIds: string[]) {
  return await EntityLinks.findMany(db, { fromIds: entityIds, role: "listedIn" });
}
