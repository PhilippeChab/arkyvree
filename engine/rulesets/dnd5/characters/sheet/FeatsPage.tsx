import { Page, Text, View } from "@react-pdf/renderer";

import type { EntriesBlock } from "@/engine/core/module/index.ts";

import ContinuationHeader from "./ContinuationHeader.tsx";
import { FONT_SIZE, styles } from "./styles.ts";

/**
 * The sheet's feats page: its feats block's entries (`block`), a feat held more than once counted ("(x2)"), then those
 * it has without a pick, in two columns.
 */
function FeatsPage({ block, name }: { block: EntriesBlock; name: string }) {
  return (
    <Page size="A4" style={styles.page}>
      <ContinuationHeader name={name} />

      {/* Feats & Abilities Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Feats & Abilities</Text>
        {(() => {
          const featEntries = [...block.entries, ...(block.granted?.entries ?? [])].map((entry) => ({
            key: entry.key,
            label: entry.count === undefined ? entry.name : `${entry.name} (x${entry.count})`,
            description: entry.description || "—",
          }));

          if (featEntries.length === 0) return <Text style={styles.emptyMessage}>No feats available</Text>;

          const columns: (typeof featEntries)[] = [[], []];
          const weights = [0, 0];
          for (const entry of featEntries) {
            const weight = entry.label.length + entry.description.length;
            const target = weights[0] <= weights[1] ? 0 : 1;
            columns[target].push(entry);
            weights[target] += weight;
          }

          return (
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              {columns.map((column, colIndex) => (
                <View key={colIndex} style={{ width: "49%" }}>
                  {column.map((entry) => (
                    <Text
                      key={entry.key}
                      style={{ fontSize: FONT_SIZE.base, marginBottom: 4, color: "#555", lineHeight: 1.4 }}
                    >
                      <Text style={{ fontWeight: "bold", color: "#000" }}>{entry.label}.</Text> {entry.description}
                    </Text>
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

export default FeatsPage;
