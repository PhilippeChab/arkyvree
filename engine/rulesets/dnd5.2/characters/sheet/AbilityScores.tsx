import { Text, View } from "@react-pdf/renderer";

import type { ScoresBlock } from "@/engine/core/module/index.ts";
import { formatSigned } from "@/shared/text.ts";

import SheetFormat from "./SheetFormat.ts";
import { FONT_SIZE, styles } from "./styles.ts";

/** The ability boxes a row holds (`styles.abilityBox`'s width): a last row short of them is filled with empty ones. */
const ABILITIES_PER_ROW = 6;

/**
 * A character's ability scores (`block`, its sheet's), a box each, in the order its sheet lists them (the books' six
 * first). Each box is labeled by its abbreviation (STR, FOR), an ability other than the books' (`named`, by its key)
 * with its name under it ("Force Points"), and gives its total, its modifier, and its base / levels / misc.
 */
function AbilityScores({ block, named }: { block: ScoresBlock; named: Set<string> }) {
  const { scores } = block;
  // The last row's empty boxes, which keep its boxes under the first row's
  const fillers = (ABILITIES_PER_ROW - (scores.length % ABILITIES_PER_ROW)) % ABILITIES_PER_ROW;
  return (
    <View style={[styles.row, { justifyContent: "space-between" }]}>
      {scores.length === 0 && (
        <Text style={{ fontSize: FONT_SIZE.md, fontStyle: "italic", color: "#888" }}>No ability scores</Text>
      )}
      {scores.map((score) => (
        <View key={score.key} style={styles.abilityBox}>
          <Text style={styles.abilityName}>{score.short}</Text>
          {named.has(score.key) && (
            <Text style={{ fontSize: FONT_SIZE.xs, color: "#666", textAlign: "center" }}>{score.label}</Text>
          )}
          <Text style={styles.abilityScore}>{SheetFormat.valueOf(score)}</Text>
          <Text style={styles.abilityMod}>{formatSigned(score.badge)}</Text>
          <Text style={{ fontSize: FONT_SIZE.xs, color: "#666", marginTop: 2, textAlign: "center" }}>
            {[score.base?.value, ...score.parts.map(({ value }) => value)].join(" / ")}
          </Text>
        </View>
      ))}
      {Array.from({ length: fillers }, (_, i) => (
        <View key={`filler-${i}`} style={{ width: styles.abilityBox.width }} />
      ))}
    </View>
  );
}

export default AbilityScores;
