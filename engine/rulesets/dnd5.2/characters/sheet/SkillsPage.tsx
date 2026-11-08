import { Page, Text, View } from "@react-pdf/renderer";

import type { SheetColumn, TableBlock } from "@/engine/core/module/index.ts";

import ContinuationHeader from "./ContinuationHeader.tsx";
import SheetFormat from "./SheetFormat.ts";
import { FONT_SIZE, styles } from "./styles.ts";

/** A skill's cell's style under its column: its name's, or a figure's, centered (bold for a total's). */
function cellStyleOf(column: SheetColumn) {
  if (column.slot === "primary") return styles.skillName;
  return [styles.skillCell, column.strong ? { fontWeight: "bold" as const } : {}];
}

/**
 * The sheet's skills page: its skills block's rows (`block`), each its ability, what its proficiency adds and its misc,
 * and its total, a proficient one marked, as its note says (its passive Perception beside it).
 */
function SkillsPage({ block, name }: { block: TableBlock; name: string }) {
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
          {block.note && (
            <Text style={{ fontSize: FONT_SIZE.sm, color: "#666", fontStyle: "italic" }}>{block.note}</Text>
          )}
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
                    column.slot === "primary" ? { width: "40%" } : { width: "15%", textAlign: "center" },
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
                        <Text key={column.key} style={cellStyleOf(column)}>
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
