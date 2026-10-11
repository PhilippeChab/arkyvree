import { Page, Text, View } from "@react-pdf/renderer";

import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";

import ContinuationHeader from "./ContinuationHeader.tsx";
import { FONT_SIZE, styles } from "./styles.ts";

/** The sheet's feats page: the feats the character picked, and those it has without a pick, in two columns. */
function FeatsPage({ detailedCharacter }: { detailedCharacter: DetailedCharacter }) {
  const identity = detailedCharacter.components.identity;
  const classes = detailedCharacter.components.classes;
  const identityData = identity.getIdentity();
  const classData = classes.getCharacterClasses();
  return (
    <Page size="A4" style={styles.page}>
      <ContinuationHeader name={identityData.physiology.name} />

      {/* Feats & Abilities Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Feats & Abilities</Text>
        {(() => {
          const allFeats = Object.values(classData).flatMap((klass) => klass.levels.flatMap((level) => level.feats));

          const groupedFeats = allFeats.reduce(
            (acc, feat) => {
              if (!acc[feat.name]) acc[feat.name] = [];
              acc[feat.name].push(feat);
              return acc;
            },
            {} as Record<string, typeof allFeats>,
          );

          const featEntries: { description: string; key: string; label: string }[] = [];
          for (const [groupIndex, featGroup] of Object.values(groupedFeats).entries()) {
            const feat = featGroup[0];
            const count = featGroup.length;
            if (feat.stackable && count > 1) {
              featEntries.push({
                key: `${feat.name}-${groupIndex}`,
                label: `${feat.name} (x${count})`,
                description: feat.description || "—",
              });
            } else {
              for (const [instanceIndex, instance] of featGroup.entries()) {
                featEntries.push({
                  key: `${instance.name}-${groupIndex}-${instanceIndex}`,
                  label: instance.name,
                  description: instance.description || "—",
                });
              }
            }
          }

          for (const feat of detailedCharacter.getVirtualFeats()) {
            featEntries.push({
              key: `virtual-${feat.id}`,
              label: feat.name,
              description: feat.description || "—",
            });
          }

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
