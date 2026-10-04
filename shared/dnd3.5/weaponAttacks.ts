/** What a sheet's weapon row reads of a weapon: its to-hit, its thrown and two-weapon attacks, and its range. */
interface WeaponAttacks {
  ranged: boolean;
  range: number;
  tohit: { total: number[] };
  thrown: { total: number[] } | null;
  twoweapon: { total: number[]; thrown: number[] | null } | null;
}

/** One attack a sheet lists for a weapon: its label (the slot, "thrown" and "two weapons" added), to-hit and range. */
export interface AttackRow {
  key: string;
  label: string;
  attack: number[];
  range: string;
}

/**
 * A weapon's attacks, a row each: its own (melee or ranged), then a melee weapon's thrown one if it has a range, then
 * the same with two weapons if its set holds one in each hand.
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
    rows.push(row(["two weapons"], weapon.twoweapon.total, ownRange));
    if (weapon.twoweapon.thrown) rows.push(row(["thrown", "two weapons"], weapon.twoweapon.thrown, thrownRange));
  }
  return rows;
}
