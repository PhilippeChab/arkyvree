/** What a sheet's weapon row reads of a weapon: its to-hit, its thrown attack, and whether it's a ranged weapon. */
interface WeaponAttacks {
  ranged: boolean;
  range: number;
  tohit: { total: number[] };
  thrown: { total: number[] } | null;
}

/** One attack a sheet lists for a weapon: its label (the slot, "thrown" added), its to-hit totals and its range. */
export interface AttackRow {
  key: string;
  label: string;
  attack: number[];
  range: string;
}

/** A weapon's attacks, a row each: its own (melee or ranged), then a melee weapon's thrown one if it has a range. */
export function buildAttackRows(weapon: WeaponAttacks, slot: string): AttackRow[] {
  const rows: AttackRow[] = [
    { key: slot, label: slot, attack: weapon.tohit.total, range: weapon.ranged ? `${weapon.range} ft.` : "Melee" },
  ];
  if (weapon.thrown) {
    rows.push({
      key: `${slot}-thrown`,
      label: `${slot}, thrown`,
      attack: weapon.thrown.total,
      range: `${weapon.range} ft.`,
    });
  }
  return rows;
}
