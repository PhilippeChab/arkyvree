import { capitalize } from "@/shared/text.ts";

/** What a sheet's weapon row reads of a weapon: its to-hit, its thrown and two-weapon attacks, and its range. */
interface WeaponAttacks {
  offend: { damage: string; total: number[] } | null;
  range: number;
  ranged: boolean;
  thrown: { total: number[] } | null;
  tohit: { total: number[] };
  twoweapon: { damage?: string; thrown: number[] | null; total: number[] } | null;
}

/**
 * One attack a sheet lists for a weapon: its label (the slot, "thrown" and "two weapons" added), to-hit and range, and
 * its damage when it isn't the weapon's (a double weapon's other end).
 */
export interface AttackRow {
  attack: number[];
  damage?: string;
  key: string;
  label: string;
  range: string;
}

/** A weapon slot's label, as an item's location names it. */
const SLOT_LABELS = { mainhand: "Main Hand", offhand: "Off Hand", twohanded: "Two Handed" } as const;

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

/** The label a sheet gives a weapon: its slot's, or a natural attack's kind ("Primary", "Secondary"), whatever slot holds it. */
export function describeWeaponSlot(
  weapon: { natural: "primary" | "secondary" | null },
  slot: keyof typeof SLOT_LABELS,
): string {
  return weapon.natural ? capitalize(weapon.natural) : SLOT_LABELS[slot];
}

/** An attack row's to-hit, its iterative attacks signed and joined ("+9/+4"); "—" for none. */
export function formatAttackBonus(attack: number[]): string {
  if (attack.length === 0) return "—";
  return attack.map((bonus) => (bonus >= 0 ? `+${bonus}` : `${bonus}`)).join("/");
}

/**
 * A weapon's critical as the SRD writes it: its multiplier alone for a threat on a 20 ("×3"), else its threat range
 * before it ("19–20/×2"). `range` is how many rolls threaten, the 20 and those under it.
 */
export function formatCritical(critical: { multiplier: number; range: number }): string {
  const multiplier = `×${critical.multiplier}`;
  return critical.range > 1 ? `${21 - critical.range}–20/${multiplier}` : multiplier;
}

/** The attacks a base attack bonus gives a round, each 5 less than the last while positive: "+11/+6/+1", or "+0". */
export function formatIterativeAttacks(bab: number): string {
  const attacks: number[] = [];
  for (let bonus = bab; bonus > 0; bonus -= 5) attacks.push(bonus);
  return formatAttackBonus(attacks.length > 0 ? attacks : [bab]);
}

/** A speed in feet ("30 ft."), or undefined when the character's isn't known: its field shows an empty value. */
export function formatSpeed(speed: number | undefined): string | undefined {
  return speed === undefined ? undefined : `${speed} ft.`;
}
