import { Text, View } from "@react-pdf/renderer";

import type SpellGroups from "@/engine/rulesets/dnd3.5/characters/description/SpellGroups.ts";
import { SPELL_LEVEL_LABELS } from "@/vocabulary/dnd3.5/spells.ts";

import { FONT_SIZE, styles } from "./styles.ts";

/** A character's slots per day, as the summary prints them (`SpellGroups.describePerDay`). */
type SpellsPerDay = ReturnType<typeof SpellGroups.describePerDay>;

/** A spell level column's width, in points: ten of them and the list's fit the page. */
const LEVEL_WIDTH = 44;

/** The list column's width, in points. */
const LIST_WIDTH = 110;

/**
 * The summary at the start of the sheet's spells: a row per spell list with slots, its slots per day at each spell level
 * the character has any ("3+1" where a cleric's domain slot or a specialist's school slot adds one), a dash where it has
 * none. Nothing for a character with no slot.
 */
function SpellsPerDayTable({ perDay }: { perDay: SpellsPerDay }) {
  if (perDay.lists.length === 0) return null;

  return (
    <View style={{ marginBottom: 6 }}>
      <Text style={{ fontSize: FONT_SIZE.lg, fontWeight: "bold", marginBottom: 2, color: "#333" }}>Spells per Day</Text>
      {/* Sized by its columns, not the page */}
      <View style={{ alignSelf: "flex-start" }}>
        <View style={styles.spellTableHeader}>
          <Text style={[styles.spellHeaderText, { width: LIST_WIDTH }]}>SPELL LIST</Text>
          {perDay.levels.map((level) => (
            <Text key={level} style={[styles.spellsPerDayHeader, { width: LEVEL_WIDTH }]}>
              {SPELL_LEVEL_LABELS[level].toUpperCase()}
            </Text>
          ))}
        </View>
        {perDay.lists.map((list) => (
          <View key={list.aptitudeName} style={[styles.spellRow, styles.spellRowInner]}>
            <Text style={[styles.spellName, { width: LIST_WIDTH }]}>{list.aptitudeName}</Text>
            {list.slots.map((slots, index) => (
              <Text key={perDay.levels[index]} style={[styles.spellsPerDayCell, { width: LEVEL_WIDTH }]}>
                {slots ?? "—"}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

export default SpellsPerDayTable;
