import { capitalize } from "@/shared/text.ts";

/** What a sheet's weapon row reads of a weapon: its to-hit, its thrown and two-weapon attacks, and its range. */
interface WeaponAttacks {
  ranged: boolean;
  range: number;
  tohit: { total: number[] };
  thrown: { total: number[] } | null;
  twoweapon: { total: number[]; thrown: number[] | null; damage?: string } | null;
  offend: { total: number[]; damage: string } | null;
}

/**
 * One attack a sheet lists for a weapon: its label (the slot, "thrown" and "two weapons" added), to-hit and range, and
 * its damage when it isn't the weapon's (a double weapon's other end).
 */
export interface AttackRow {
  key: string;
  label: string;
  attack: number[];
  range: string;
  damage?: string;
}

/** A weapon slot's label, as an item's location names it. */
const SLOT_LABELS = { mainhand: "Main Hand", offhand: "Off Hand", twohanded: "Two Handed" } as const;

/** The label a sheet gives a weapon: its slot's, or a natural attack's kind ("Primary", "Secondary"), whatever slot holds it. */
export function describeWeaponSlot(
  weapon: { natural: "primary" | "secondary" | null },
  slot: keyof typeof SLOT_LABELS,
): string {
  return weapon.natural ? capitalize(weapon.natural) : SLOT_LABELS[slot];
}

/**
 * A weapon's attacks, a row each: its own (melee or ranged), then a melee weapon's thrown one if it has a range, then
 * the same with two weapons if its set holds one in each hand (or it's a double weapon), and a double weapon's other end.
 */
export function buildAttackRows(weapon: WeaponAttacks, slot: string): AttackRow[] {
  const ownRange = weapon.ranged ? `${weapon.range} ft.` : "Melee";
  const thrownRange = `${weapon.range} ft.`;
  const row = (ways: string[], attack: number[], range: string): AttackRow => {
    const label = [slot, ...ways].join(", ");
    return { key: label, label, attack, range };
  };

  const rows = [row([], weapon.tohit.total, ownRange)];
  if (weapon.thrown) rows.push(row(["thrown"], weapon.thrown.total, thrownRange));
  if (weapon.twoweapon) {
    const { damage } = weapon.twoweapon;
    rows.push({ ...row(["two weapons"], weapon.twoweapon.total, ownRange), ...(damage && { damage }) });
    if (weapon.twoweapon.thrown) rows.push(row(["thrown", "two weapons"], weapon.twoweapon.thrown, thrownRange));
  }
  if (weapon.offend) rows.push({ ...row(["other end"], weapon.offend.total, ownRange), damage: weapon.offend.damage });
  return rows;
}
