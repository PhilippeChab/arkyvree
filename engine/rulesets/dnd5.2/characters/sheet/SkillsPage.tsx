import { Page, Text, View } from "@react-pdf/renderer";

import type { SheetColumn, TableBlock } from "@/engine/core/module/index.ts";

import ContinuationHeader from "./ContinuationHeader.tsx";
import SheetFormat from "./SheetFormat.ts";
import { FONT_SIZE, styles } from "./styles.ts";

/**
 * A skill's cell's style under its column: its name's, or a figure's, centered (bold for a total's); greyed for a skill
 * the character can't use yet (`untrained`).
 */
function cellStyleOf(column: SheetColumn, untrained: boolean) {
  if (column.slot === "primary") return untrained ? styles.skillNameUntrained : styles.skillName;
  return [
    untrained ? styles.skillCellUntrained : styles.skillCell,
    column.strong ? { fontWeight: "bold" as const } : {},
  ];
}

/**
 * The sheet's skills page: its skills block's rows (`block`), each its rank, its ability and the bonuses it totals, a
 * skill it can't use yet (`untrained`, by name) greyed, and its skill points (`budget`), none for a creature that buys no
 * skills (a bonded creature's: its stat block's, or its master's).
 */
function SkillsPage({
  block,
  budget,
  name,
  untrained,
}: {
  block: TableBlock;
  budget?: { spent: number; total: number };
  name: string;
  untrained: Set<string>;
}) {
  const { columns, rows } = block.table;
  return (
    <Page size="A4" style={styles.page}>
      <ContinuationHeader name={name} />

      {/* Skills Section */}
      <View style={styles.section}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "baseline",
            borderBottom: "1px solid #888",
            marginBottom: 4,
            paddingBottom: 2,
          }}
        >
          <Text style={{ fontSize: FONT_SIZE.xl, fontWeight: "bold", color: "#333" }}>Skills</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 12 }}>
            <Text style={{ fontSize: FONT_SIZE.sm, color: "#666", fontStyle: "italic" }}>* = Class Skill</Text>
            {budget && (
              <Text style={{ fontSize: FONT_SIZE.sm, color: "#333" }}>
                Skill Points: {budget.spent || 0} / {budget.total || 0}
              </Text>
            )}
          </View>
        </View>

        {(() => {
          if (rows.length === 0) return <Text style={styles.emptyMessage}>No skills available</Text>;

          const half = Math.ceil(rows.length / 2);
          const halves = [rows.slice(0, half), rows.slice(half)];

          const renderHeader = () => (
            <View style={styles.skillsHeader}>
              {columns.map((column) => (
                <Text
                  key={column.key}
                  style={[
                    styles.skillHeaderText,
                    column.slot === "primary" ? { width: "40%" } : { width: "12%", textAlign: "center" },
                  ]}
                >
                  {column.label.toUpperCase()}
                </Text>
              ))}
            </View>
          );

          return (
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              {halves.map((side, sideIndex) => (
                <View key={sideIndex} style={{ width: "49%" }}>
                  {renderHeader()}
                  {side.map((row) => (
                    <View key={row.key} style={styles.skillItem}>
                      {columns.map((column) => (
                        <Text key={column.key} style={cellStyleOf(column, untrained.has(row.key))}>
                          {SheetFormat.cellOf(row, column)}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          );
        })()}
      </View>
    </Page>
  );
}

export default SkillsPage;
