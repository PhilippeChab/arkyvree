import { Text, View } from "@react-pdf/renderer";
import { type ReactNode } from "react";

import type { SheetStat, SheetTable, StatsBlock, StatsPanel } from "@/engine/core/module/index.ts";

import SheetFormat from "./SheetFormat.ts";
import { FONT_SIZE, styles } from "./styles.ts";

/**
 * The attacks table's columns' widths, by their keys, each wide enough for its value on one line: the weapon's name and
 * how it attacks, its attack bonus, a damage ("2d6+4"), a critical ("19–20"), a range ("150/600 ft."), a damage type
 * ("Bludgeoning") and a mastery ("Topple").
 */
const COLUMN_WIDTHS: Record<string, string> = {
  weapon: "24%",
  attack: "11%",
  damage: "12%",
  critical: "9%",
  range: "15%",
  type: "15%",
  mastery: "14%",
};

/** A weapon set's Armor Class (`boxes`), a box each. */
function ArmorClassBoxes({ boxes }: { boxes: SheetStat[] }) {
  return (
    <View style={[styles.row, { gap: 4 }]}>
      {boxes.map(({ label, value }) => (
        <View key={label} style={styles.armorClassBox}>
          <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
          <Text style={styles.statValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * A weapon set's attacks (`table`): a row each, its weapon's name and the attack's slot (its caption), and an alert when
 * its wielder isn't proficient, before its other cells, an empty one a dash.
 */
function AttacksTable({ table }: { table: SheetTable }) {
  const [name, ...figures] = table.columns;
  return (
    <View>
      <View style={[styles.tableRow, styles.tableHeader]}>
        {table.columns.map((column) => (
          <Text key={column.key} style={[styles.tableCell, { width: COLUMN_WIDTHS[column.key], fontWeight: "bold" }]}>
            {column.label}
          </Text>
        ))}
      </View>
      {table.rows.map((row) => (
        <View key={row.key} style={styles.tableRow}>
          <View style={[styles.tableCell, { width: COLUMN_WIDTHS[name.key] }]}>
            <Text>{row.cells[name.key]}</Text>
            <Text style={{ fontSize: FONT_SIZE.sm, color: "#666" }}>{row.caption}</Text>
            {row.alert && (
              <Text style={{ fontSize: FONT_SIZE.xs, color: "#cc0000", fontWeight: "bold" }}>{row.alert}</Text>
            )}
          </View>
          {figures.map((column) => (
            <Text key={column.key} style={[styles.tableCell, { width: COLUMN_WIDTHS[column.key] }]}>
              {SheetFormat.cellOf(row, column)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * A weapon set, as the web sheet shows it: its heading ("SET 1 · Longsword, Shield"), its Armor Class, then
 * its attacks, kept on one page. A character with no weapon set shows its one set without a heading.
 */
function WeaponSet({ panel }: { panel: StatsPanel }) {
  const { boxes, heading, table } = panel;
  return (
    <View style={{ marginBottom: 6 }} wrap={false}>
      {heading && (
        <Text style={{ fontSize: FONT_SIZE.md, fontWeight: "bold", marginBottom: 3, color: "#444" }}>
          {heading.label.toUpperCase()}
          {heading.note && <Text style={{ fontWeight: "normal", color: "#666" }}>{` · ${heading.note}`}</Text>}
        </Text>
      )}
      {boxes && <ArmorClassBoxes boxes={boxes} />}
      {table && table.rows.length > 0 ? (
        <AttacksTable table={table} />
      ) : (
        <Text style={styles.emptyMessage}>{table?.empty}</Text>
      )}
    </View>
  );
}

/**
 * The combat block's weapon sets (`combat`'s panels), each kept on one page, the first with what leads it (`children`:
 * the combat's heading and stats), which never stands alone at a page's foot: when the page has no room left for them
 * and the first set, they go to the next page together, and the other sets follow, each where it fits.
 */
function WeaponSets({ children, combat }: { children: ReactNode; combat: StatsBlock }) {
  const [first, ...others] = combat.panels;
  return (
    <>
      <View wrap={false}>
        {children}
        {first && <WeaponSet panel={first} />}
      </View>
      {others.map((panel) => (
        <WeaponSet key={panel.key} panel={panel} />
      ))}
    </>
  );
}

export default WeaponSets;
