import { Page, Text, View } from "@react-pdf/renderer";

import type { InventoryBlock } from "@/engine/core/module/index.ts";

import ContinuationHeader from "./ContinuationHeader.tsx";
import { FONT_SIZE, styles } from "./styles.ts";

/** The color of a load past light, by how grave it is. */
const LOAD_COLORS = { error: "#d32f2f", info: "#0288d1", warning: "#ed6c02" } as const;

/**
 * The sheet's inventory page: its inventory block's rows (`block`), what the character carries and where, and the load
 * it makes, its carried weight first.
 */
function InventoryPage({ block, name }: { block: InventoryBlock; name: string }) {
  const { load, rows, units } = block;
  const [carried, ...limits] = load?.figures ?? [];
  return (
    <Page size="A4" style={styles.page}>
      <ContinuationHeader name={name} />

      {/* Inventory Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Inventory</Text>

        {rows.length > 0 ? (
          <View style={styles.inventoryTable}>
            <View style={styles.inventoryTableHeader}>
              <Text style={[styles.inventoryHeaderText, { width: "26%", paddingHorizontal: 4 }]}>ITEM</Text>
              <Text style={[styles.inventoryHeaderText, { width: "9%", paddingHorizontal: 2, textAlign: "center" }]}>
                QUANTITY
              </Text>
              <Text style={[styles.inventoryHeaderText, { width: "17%", paddingHorizontal: 2 }]}>SLOT</Text>
              <Text style={[styles.inventoryHeaderText, { width: "8%", paddingHorizontal: 2, textAlign: "right" }]}>
                WEIGHT
              </Text>
              <Text style={[styles.inventoryHeaderText, { width: "8%", paddingHorizontal: 2, textAlign: "right" }]}>
                VALUE
              </Text>
              <Text style={[styles.inventoryHeaderText, { width: "9%", paddingHorizontal: 2, textAlign: "center" }]}>
                CHARGES
              </Text>
              <Text style={[styles.inventoryHeaderText, { width: "23%", paddingHorizontal: 4 }]}>DESCRIPTION</Text>
            </View>

            {rows.map((row) => (
              <View key={row.key} style={[styles.inventoryTableRow, row.held ? {} : { backgroundColor: "#fafafa" }]}>
                <View style={{ width: "26%", paddingHorizontal: 4 }}>
                  <Text style={{ fontSize: FONT_SIZE.base, fontWeight: row.held ? "bold" : "normal" }}>{row.name}</Text>
                  {!row.held && <Text style={{ fontSize: FONT_SIZE.xs, color: "#888" }}>unequipped</Text>}
                </View>
                <Text style={{ fontSize: FONT_SIZE.base, width: "9%", paddingHorizontal: 2, textAlign: "center" }}>
                  {row.quantity}
                </Text>
                <Text style={{ fontSize: FONT_SIZE.base, width: "17%", paddingHorizontal: 2 }}>{row.slot ?? "—"}</Text>
                <Text style={{ fontSize: FONT_SIZE.base, width: "8%", paddingHorizontal: 2, textAlign: "right" }}>
                  {row.weight === null ? "—" : `${row.weight} ${units.weight.one}`}
                </Text>
                <Text style={{ fontSize: FONT_SIZE.base, width: "8%", paddingHorizontal: 2, textAlign: "right" }}>
                  {row.cost === null ? "—" : `${row.cost} ${units.cost.one}`}
                </Text>
                <Text style={{ fontSize: FONT_SIZE.base, width: "9%", paddingHorizontal: 2, textAlign: "center" }}>
                  {row.charges ? `${row.charges.remaining ?? 0}/${row.charges.total}` : "—"}
                </Text>
                <Text style={{ fontSize: FONT_SIZE.sm, width: "23%", paddingHorizontal: 4, color: "#555" }}>
                  {row.description || "—"}
                </Text>
              </View>
            ))}
            {/* Weight Summary Footer */}
            {load && carried && (
              <View style={styles.inventoryTableFooter}>
                <Text style={[styles.inventoryFooterText, { width: "52%", paddingHorizontal: 4 }]}>
                  {carried.label}: {carried.weight} {units.weight.many}
                </Text>
                {limits.map((limit) => (
                  <Text
                    key={limit.label}
                    style={[styles.inventoryFooterText, { width: "12%", paddingHorizontal: 2, fontWeight: "normal" }]}
                  >
                    {limit.label}: {limit.weight}
                  </Text>
                ))}
                {load.status && (
                  <Text
                    style={[
                      styles.inventoryFooterText,
                      { width: "12%", paddingHorizontal: 2, color: LOAD_COLORS[load.status.tone] },
                    ]}
                  >
                    {load.status.label}
                  </Text>
                )}
              </View>
            )}
          </View>
        ) : (
          <Text style={styles.emptyMessage}>No items in inventory</Text>
        )}
      </View>
    </Page>
  );
}

export default InventoryPage;
