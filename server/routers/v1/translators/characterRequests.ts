/**
 * A v1 write of a character's parts, as its service takes it: an inventory entry's charges apart, and a level's picks
 * grouped by the aptitude they're picked in, its spells the service's powers.
 */

import { BadRequestError } from "@/server/errors/index.ts";
import type { ItemLocation } from "@/shared/enums.ts";

/** An inventory entry's charges: those it has left, out of those it came with. */
interface Charges {
  remaining: number | null;
  total: number | null;
}

/** A level's picks as v1 sends them: each its feat or its spell, and the aptitude it's picked in. */
interface LevelPicks {
  abilityIncreases: { abilityId: string; amount: number }[];
  feats: { aptitudeId: string; featId: string }[];
  force: boolean;
  hitPoints: number;
  skillPoints: Record<string, number>;
  spells: { aptitudeId: string; spellId: string }[];
}

/** Picks grouped by the aptitude they're picked in, as the level saves take them. */
function groupByAptitude<K extends "featId" | "spellId">(
  picks: ({ aptitudeId: string } & Record<K, string>)[],
  key: K,
) {
  const grouped = Map.groupBy(picks, (pick) => pick.aptitudeId);
  return Object.fromEntries(
    [...grouped].map(([aptitudeId, ofAptitude]) => [aptitudeId, ofAptitude.map((pick) => pick[key])]),
  );
}

/** A level's picks, as the levels' saves take them: by aptitude. */
function toLevelPicks({ abilityIncreases, feats, force, hitPoints, skillPoints, spells }: LevelPicks) {
  return {
    abilityIncreases,
    feats: groupByAptitude(feats, "featId"),
    force,
    hp: hitPoints,
    powers: groupByAptitude(spells, "spellId"),
    skills: skillPoints,
  };
}

/**
 * Where an entry is held, as the service takes it: equipped exactly when it has a location, the one a body leaves out
 * read off the other. Refused when a body names them at odds: an equipped item nowhere, or a place for one it isn't.
 */
function toPlacement(equipped: boolean | undefined, location: ItemLocation | null) {
  const placed = location !== null;
  if (equipped !== undefined && equipped !== placed) {
    throw new BadRequestError(
      equipped ? "An equipped item needs its `location`" : "An item it doesn't equip has no `location`",
    );
  }
  return { equipped: placed, location };
}

/**
 * An inventory entry's update, what its body leaves out kept from the entry as it is (`before`), as the service takes
 * it: every column, its charges its own two numbers.
 */
export function toInventoryEditRequest(
  before: {
    charges: Charges | null;
    equipped: boolean;
    location: ItemLocation | null;
    quantity: number;
  },
  body: {
    charges?: Charges | null;
    equipped?: boolean;
    force: boolean;
    location?: ItemLocation | null;
    quantity?: number;
    weaponSets?: number[];
  },
) {
  // An entry the body unequips leaves its place; one it equips without naming a place keeps the one it has
  const location = body.location !== undefined ? body.location : body.equipped === false ? null : before.location;
  return toInventoryRequest({
    charges: body.charges === undefined ? before.charges : body.charges,
    equipped: body.equipped,
    force: body.force,
    location,
    quantity: body.quantity ?? before.quantity,
    // None named: those it's held in, as the engine keeps them, or a hand's first
    weaponSets: body.weaponSets,
  });
}

/**
 * An inventory entry's write, its charges the service's own two numbers (none named when the body leaves them out: an
 * added item's own), and whether it's equipped read off its location when the body leaves it out: refused when the two
 * are at odds.
 */
export function toInventoryRequest<
  T extends { charges?: Charges | null; equipped?: boolean; location: ItemLocation | null },
>({ charges, equipped, location, ...body }: T) {
  return {
    ...body,
    ...toPlacement(equipped, location),
    // Left out, an added item's own: none named, which only a body that can leave them out names
    remainingCharges: charges === undefined ? undefined : (charges?.remaining ?? null),
    totalCharges: charges === undefined ? undefined : (charges?.total ?? null),
  };
}

/**
 * A saved level's edit, what its body leaves out kept from the level as it was saved (`before`), as the levels' service
 * takes it: its picks by aptitude.
 */
export function toLevelEditRequest(
  before: Omit<LevelPicks, "force">,
  body: Partial<Omit<LevelPicks, "force">> & { force: boolean },
) {
  return toLevelPicks({
    abilityIncreases: body.abilityIncreases ?? before.abilityIncreases,
    feats: body.feats ?? before.feats.map(({ aptitudeId, featId }) => ({ aptitudeId, featId })),
    force: body.force,
    hitPoints: body.hitPoints ?? before.hitPoints,
    skillPoints: body.skillPoints ?? before.skillPoints,
    spells: body.spells ?? before.spells.map(({ aptitudeId, spellId }) => ({ aptitudeId, spellId })),
  });
}

/** A new level's save, as the levels' service takes a level-up of one level: its class, and its picks by aptitude. */
export function toLevelSaveRequest({ classId, level, ...picks }: LevelPicks & { classId: string; level: number }) {
  const { abilityIncreases, hp, ...rest } = toLevelPicks(picks);
  return { ...rest, levels: [{ abilityIncreases, hp, klassId: classId, level }] };
}
