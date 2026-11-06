import { Text, View } from "@react-pdf/renderer";

import type SpellGroups from "@/engine/rulesets/dnd5.2/characters/description/SpellGroups.ts";
import { SPELL_LEVEL_LABELS } from "@/vocabulary/dnd5.2/spells.ts";

import { FONT_SIZE, styles } from "./styles.ts";

/** A character's spell slots, as the summary prints them (`SpellGroups.describeSlots`). */
type SpellSlots = ReturnType<typeof SpellGroups.describeSlots>;

/** A spell level column's width, in points: nine of them and the row's name fit the page. */
const LEVEL_WIDTH = 44;

/** The row's name's column's width, in points. */
const LIST_WIDTH = 110;

/**
 * The summary at the start of the sheet's spells: its Spellcasting's slots at each spell level the character has any,
 * and its Pact Magic's apart, a dash where a row has none. Nothing for a character with no slot.
 */
function SpellSlotsTable({ slots }: { slots: SpellSlots }) {
  if (slots.lists.length === 0) return null;

  return (
    <View style={{ marginBottom: 6 }}>
      <Text style={{ fontSize: FONT_SIZE.lg, fontWeight: "bold", marginBottom: 2, color: "#333" }}>Spell Slots</Text>
      {/* Sized by its columns, not the page */}
      <View style={{ alignSelf: "flex-start" }}>
        <View style={styles.spellTableHeader}>
          <Text style={[styles.spellHeaderText, { width: LIST_WIDTH }]}>SLOTS</Text>
          {slots.levels.map((level) => (
            <Text key={level} style={[styles.spellsPerDayHeader, { width: LEVEL_WIDTH }]}>
              {SPELL_LEVEL_LABELS[level].toUpperCase()}
            </Text>
          ))}
        </View>
        {slots.lists.map((list) => (
          <View key={list.aptitudeName} style={[styles.spellRow, styles.spellRowInner]}>
            <Text style={[styles.spellName, { width: LIST_WIDTH }]}>{list.aptitudeName}</Text>
            {list.slots.map((count, index) => (
              <Text key={slots.levels[index]} style={[styles.spellsPerDayCell, { width: LEVEL_WIDTH }]}>
                {count ?? "—"}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

export default SpellSlotsTable;
