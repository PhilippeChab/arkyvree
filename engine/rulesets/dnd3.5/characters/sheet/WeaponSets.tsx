import { Text, View } from "@react-pdf/renderer";

import type CombatSheet from "@/engine/rulesets/dnd3.5/characters/description/CombatSheet.ts";

import { FONT_SIZE, styles } from "./styles.ts";

/** A character's combat as the sheets print it (`CombatSheet.describe`). */
type SheetCombat = ReturnType<typeof CombatSheet.describe>;

/** A weapon set as the sheets print it. */
type SheetWeaponSet = SheetCombat["weaponSets"][number];

/** A weapon set's armor class boxes, by their label: its AC first, emphasized. */
const ARMOR_CLASS_BOXES = [
  ["AC", "total"],
  ["TOUCH", "touch"],
  ["FLAT-FOOTED", "flatfooted"],
] as const;

/** A weapon set's armor class: its AC, in bold with a thicker border, then its touch and flat-footed AC. */
function ArmorClassBoxes({ ac }: { ac: SheetWeaponSet["ac"] }) {
  return (
    <View style={[styles.row, { gap: 4 }]}>
      {ARMOR_CLASS_BOXES.map(([label, total], index) => (
        <View key={label} style={index === 0 ? [styles.armorClassBox, styles.armorClassBoxMain] : styles.armorClassBox}>
          <Text style={index === 0 ? [styles.statLabel, { fontWeight: "bold", color: "#333" }] : styles.statLabel}>
            {label}
          </Text>
          <Text style={styles.statValue}>{ac[total]}</Text>
        </View>
      ))}
    </View>
  );
}

/** A weapon set's attacks: a row each, its weapon's name and the attack's slot over its to-hit, damage and critical. */
function AttacksTable({ weapons }: { weapons: SheetWeaponSet["weapons"] }) {
  return (
    <View>
      <View style={[styles.tableRow, styles.tableHeader]}>
        <Text style={[styles.tableCell, { width: "27%", fontWeight: "bold" }]}>Weapon</Text>
        <Text style={[styles.tableCell, { width: "18%", fontWeight: "bold" }]}>Attack Bonus</Text>
        <Text style={[styles.tableCell, { width: "18%", fontWeight: "bold" }]}>Damage</Text>
        <Text style={[styles.tableCell, { width: "13%", fontWeight: "bold" }]}>Critical</Text>
        <Text style={[styles.tableCell, { width: "11%", fontWeight: "bold" }]}>Range</Text>
        <Text style={[styles.tableCell, { width: "13%", fontWeight: "bold" }]}>Type</Text>
      </View>
      {weapons.flatMap((weapon) =>
        weapon.rows.map((row) => (
          <View key={row.key} style={styles.tableRow}>
            <View style={[styles.tableCell, { width: "27%" }]}>
              <Text>{weapon.name}</Text>
              <Text style={{ fontSize: FONT_SIZE.sm, color: "#666" }}>{row.label}</Text>
              {weapon.proficient === false && (
                <Text style={{ fontSize: FONT_SIZE.xs, color: "#cc0000", fontWeight: "bold" }}>
                  Not Proficient (-4)
                </Text>
              )}
            </View>
            <Text style={[styles.tableCell, { width: "18%" }]}>{row.attack}</Text>
            <Text style={[styles.tableCell, { width: "18%" }]}>{row.damage}</Text>
            <Text style={[styles.tableCell, { width: "13%" }]}>{row.critical}</Text>
            <Text style={[styles.tableCell, { width: "11%" }]}>{row.range}</Text>
            <Text style={[styles.tableCell, { width: "13%" }]}>{row.types}</Text>
          </View>
        )),
      )}
    </View>
  );
}

/**
 * The sheet's weapon sets, each a loadout, as the web sheet shows them: its heading ("SET 1 · Longsword, Heavy Steel
 * Shield"), its armor class, then its attacks. A character with no weapon set shows its one loadout without a heading.
 */
function WeaponSets({ combat }: { combat: SheetCombat }) {
  return combat.weaponSets.map(({ set, ac, held, weapons }) => (
    <View key={set} style={{ marginBottom: 6 }}>
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
  ));
}

export default WeaponSets;
