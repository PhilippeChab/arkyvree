import { Text, View } from "@react-pdf/renderer";
import { type ReactNode } from "react";

import type CombatSheet from "@/engine/rulesets/dnd3.5/characters/description/CombatSheet.ts";

import { FONT_SIZE, styles } from "./styles.ts";

/** A character's combat as the sheets print it (`CombatSheet.describe`). */
type SheetCombat = ReturnType<typeof CombatSheet.describe>;

/** A weapon set as the sheets print it. */
type SheetWeaponSet = SheetCombat["weaponSets"][number];

/** A weapon set's armor class boxes, by their label. */
const ARMOR_CLASS_BOXES = [
  ["AC", "total"],
  ["TOUCH", "touch"],
  ["FLAT-FOOTED", "flatfooted"],
] as const;

/**
 * The attacks table's columns' widths, each wide enough for its value on one line: the weapon's name and how it
 * attacks, four iterative attacks ("+20/+15/+10/+5"), a damage, a critical, a range ("1,200 ft."), its increment
 * ("-2 / 120 ft.") and two damage types ("Slashing, Piercing").
 */
const COLUMN_WIDTHS = {
  weapon: "24%",
  attack: "15%",
  damage: "12%",
  critical: "10%",
  range: "10%",
  increment: "13%",
  types: "16%",
} as const;

/** A weapon set's armor class: its AC, its touch AC and its flat-footed AC, a box each. */
function ArmorClassBoxes({ ac }: { ac: SheetWeaponSet["ac"] }) {
  return (
    <View style={[styles.row, { gap: 4 }]}>
      {ARMOR_CLASS_BOXES.map(([label, total]) => (
        <View key={label} style={styles.armorClassBox}>
          <Text style={styles.statLabel}>{label}</Text>
          <Text style={styles.statValue}>{ac[total]}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * A weapon set's attacks: a row each, its weapon's name and the attack's slot before its to-hit, damage, critical, range,
 * range increment and damage types; a melee attack's range and increment empty.
 */
function AttacksTable({ weapons }: { weapons: SheetWeaponSet["weapons"] }) {
  return (
    <View>
      <View style={[styles.tableRow, styles.tableHeader]}>
        <Text style={[styles.tableCell, { width: COLUMN_WIDTHS.weapon, fontWeight: "bold" }]}>Weapon</Text>
        <Text style={[styles.tableCell, { width: COLUMN_WIDTHS.attack, fontWeight: "bold" }]}>Attack Bonus</Text>
        <Text style={[styles.tableCell, { width: COLUMN_WIDTHS.damage, fontWeight: "bold" }]}>Damage</Text>
        <Text style={[styles.tableCell, { width: COLUMN_WIDTHS.critical, fontWeight: "bold" }]}>Critical</Text>
        <Text style={[styles.tableCell, { width: COLUMN_WIDTHS.range, fontWeight: "bold" }]}>Range</Text>
        <Text style={[styles.tableCell, { width: COLUMN_WIDTHS.increment, fontWeight: "bold" }]}>Increment</Text>
        <Text style={[styles.tableCell, { width: COLUMN_WIDTHS.types, fontWeight: "bold" }]}>Type</Text>
      </View>
      {weapons.flatMap((weapon) =>
        weapon.rows.map((row) => (
          <View key={row.key} style={styles.tableRow}>
            <View style={[styles.tableCell, { width: COLUMN_WIDTHS.weapon }]}>
              <Text>{weapon.name}</Text>
              <Text style={{ fontSize: FONT_SIZE.sm, color: "#666" }}>{row.label}</Text>
              {weapon.proficient === false && (
                <Text style={{ fontSize: FONT_SIZE.xs, color: "#cc0000", fontWeight: "bold" }}>
                  Not Proficient (-4)
                </Text>
              )}
            </View>
            <Text style={[styles.tableCell, { width: COLUMN_WIDTHS.attack }]}>{row.attack}</Text>
            <Text style={[styles.tableCell, { width: COLUMN_WIDTHS.damage }]}>{row.damage}</Text>
            <Text style={[styles.tableCell, { width: COLUMN_WIDTHS.critical }]}>{row.critical}</Text>
            <Text style={[styles.tableCell, { width: COLUMN_WIDTHS.range }]}>{row.range || "—"}</Text>
            <Text style={[styles.tableCell, { width: COLUMN_WIDTHS.increment }]}>{row.increment || "—"}</Text>
            <Text style={[styles.tableCell, { width: COLUMN_WIDTHS.types }]}>{row.types}</Text>
          </View>
        )),
      )}
    </View>
  );
}

/**
 * A weapon set, as the web sheet shows it: its heading ("SET 1 · Longsword, Heavy Steel Shield"), its armor class, then
 * its attacks, kept on one page. A character with no weapon set shows its one set without a heading.
 */
function WeaponSet({ combat, weaponSet }: { combat: SheetCombat; weaponSet: SheetWeaponSet }) {
  const { set, ac, held, weapons } = weaponSet;
  return (
    <View style={{ marginBottom: 6 }} wrap={false}>
      {combat.hasWeaponSets && (
        <Text style={{ fontSize: FONT_SIZE.md, fontWeight: "bold", marginBottom: 3, color: "#444" }}>
          {`SET ${set + 1}`}
          {held.length > 0 && <Text style={{ fontWeight: "normal", color: "#666" }}>{` · ${held.join(", ")}`}</Text>}
        </Text>
      )}
      <ArmorClassBoxes ac={ac} />
      {weapons.length > 0 ? (
        <AttacksTable weapons={weapons} />
      ) : (
        <Text style={styles.emptyMessage}>No weapons equipped</Text>
      )}
    </View>
  );
}

/**
 * The sheet's weapon sets, each kept on one page, the first with what leads it (`children`: the combat's heading and
 * stats), which never stands alone at a page's foot: when the page has no room left for them and the first set, they go
 * to the next page together, and the other sets follow, each where it fits.
 */
function WeaponSets({ children, combat }: { children: ReactNode; combat: SheetCombat }) {
  const [first, ...others] = combat.weaponSets;
  return (
    <>
      <View wrap={false}>
        {children}
        {first && <WeaponSet combat={combat} weaponSet={first} />}
      </View>
      {others.map((weaponSet) => (
        <WeaponSet key={weaponSet.set} combat={combat} weaponSet={weaponSet} />
      ))}
    </>
  );
}

export default WeaponSets;
