import { Page, Text, View } from "@react-pdf/renderer";

import type DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";
import { capitalize } from "@/shared/utils.ts";

import ContinuationHeader from "./ContinuationHeader.tsx";
import { FONT_SIZE, styles } from "./styles.ts";

const InventoryPage = ({ detailedCharacter }: { detailedCharacter: DetailedCharacter }) => {
  const identity = detailedCharacter.getDetailedCharacterIdentity();
  const combat = detailedCharacter.getDetailedCharacterCombat();
  const inventory = detailedCharacter.getDetailedCharacterInventory();
  const identityData = identity.getIdentity();
  const combatData = combat.getCombat();
  return (
    <Page size="A4" style={styles.page}>
      <ContinuationHeader name={identityData.physiology.name} />

      {/* Inventory Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Inventory</Text>

        {(() => {
          const flatItems = inventory.getFlatInventory();

          return flatItems.length > 0 ? (
            <View style={styles.inventoryTable}>
              <View style={styles.inventoryTableHeader}>
                <Text style={[styles.inventoryHeaderText, { width: "26%", paddingHorizontal: 4 }]}>ITEM</Text>
                <Text style={[styles.inventoryHeaderText, { width: "6%", paddingHorizontal: 2, textAlign: "center" }]}>
                  QTY
                </Text>
                <Text style={[styles.inventoryHeaderText, { width: "12%", paddingHorizontal: 2 }]}>SLOT</Text>
                <Text style={[styles.inventoryHeaderText, { width: "8%", paddingHorizontal: 2, textAlign: "right" }]}>
                  WT
                </Text>
                <Text style={[styles.inventoryHeaderText, { width: "8%", paddingHorizontal: 2, textAlign: "right" }]}>
                  VALUE
                </Text>
                <Text style={[styles.inventoryHeaderText, { width: "10%", paddingHorizontal: 2, textAlign: "center" }]}>
                  CHARGES
                </Text>
                <Text style={[styles.inventoryHeaderText, { width: "30%", paddingHorizontal: 4 }]}>DESCRIPTION</Text>
              </View>

              {flatItems.map((entry, i) => (
                <View key={i} style={[styles.inventoryTableRow, !entry.equipped ? { backgroundColor: "#fafafa" } : {}]}>
                  <View style={{ width: "26%", paddingHorizontal: 4 }}>
                    <Text style={{ fontSize: FONT_SIZE.base, fontWeight: entry.equipped ? "bold" : "normal" }}>
                      {entry.item.name}
                    </Text>
                    {!entry.equipped && <Text style={{ fontSize: FONT_SIZE.xs, color: "#888" }}>unequipped</Text>}
                  </View>
                  <Text style={{ fontSize: FONT_SIZE.base, width: "6%", paddingHorizontal: 2, textAlign: "center" }}>
                    {entry.quantity}
                  </Text>
                  <Text style={{ fontSize: FONT_SIZE.base, width: "12%", paddingHorizontal: 2 }}>
                    {entry.location ?? "—"}
                  </Text>
                  <Text style={{ fontSize: FONT_SIZE.base, width: "8%", paddingHorizontal: 2, textAlign: "right" }}>
                    {entry.item.weight ? `${parseFloat(entry.item.weight)} lb` : "—"}
                  </Text>
                  <Text style={{ fontSize: FONT_SIZE.base, width: "8%", paddingHorizontal: 2, textAlign: "right" }}>
                    {entry.item.costGp ? `${parseFloat(entry.item.costGp)} gp` : "—"}
                  </Text>
                  <Text style={{ fontSize: FONT_SIZE.base, width: "10%", paddingHorizontal: 2, textAlign: "center" }}>
                    {entry.totalCharges != null ? `${entry.remainingCharges ?? 0}/${entry.totalCharges}` : "—"}
                  </Text>
                  <Text style={{ fontSize: FONT_SIZE.sm, width: "30%", paddingHorizontal: 4, color: "#555" }}>
                    {entry.item.description || "—"}
                  </Text>
                </View>
              ))}
              {/* Weight Summary Footer */}
              <View style={styles.inventoryTableFooter}>
                <Text style={[styles.inventoryFooterText, { width: "44%", paddingHorizontal: 4 }]}>
                  Carried Weight: {combatData.encumbrance.carriedweight} lbs
                </Text>
                <Text
                  style={[styles.inventoryFooterText, { width: "14%", paddingHorizontal: 2, fontWeight: "normal" }]}
                >
                  Light: {combatData.encumbrance.lightload}
                </Text>
                <Text
                  style={[styles.inventoryFooterText, { width: "14%", paddingHorizontal: 2, fontWeight: "normal" }]}
                >
                  Medium: {combatData.encumbrance.mediumload}
                </Text>
                <Text
                  style={[styles.inventoryFooterText, { width: "14%", paddingHorizontal: 2, fontWeight: "normal" }]}
                >
                  Heavy: {combatData.encumbrance.heavyload}
                </Text>
                {combatData.encumbrance.load !== "light" && (
                  <Text
                    style={[
                      styles.inventoryFooterText,
                      {
                        width: "14%",
                        paddingHorizontal: 2,
                        color:
                          combatData.encumbrance.load === "overloaded"
                            ? "#d32f2f"
                            : combatData.encumbrance.load === "heavy"
                              ? "#ed6c02"
                              : "#0288d1",
                      },
                    ]}
                  >
                    {capitalize(combatData.encumbrance.load)}
                  </Text>
                )}
              </View>
            </View>
          ) : (
            <Text style={styles.emptyMessage}>No items in inventory</Text>
          );
        })()}
      </View>
    </Page>
  );
};

export default InventoryPage;
