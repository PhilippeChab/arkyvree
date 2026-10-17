import { Text, View } from "@react-pdf/renderer";

import type AbilitiesComponent from "@/engine/rulesets/dnd3.5/model/abilities/AbilitiesComponent.ts";
import { sortByOrder } from "@/shared/sortByOrder.ts";
import { stripSeparators } from "@/shared/text.ts";
import { ABILITY_NAMES } from "@/vocabulary/dnd3.5/abilities.ts";

import SheetFormat from "./SheetFormat.ts";
import { FONT_SIZE, styles } from "./styles.ts";

/** A character's abilities as the sheets print them, by slug (`AbilitiesComponent.getAbilitiesWithIds`). */
type SheetAbilities = ReturnType<AbilitiesComponent["getAbilitiesWithIds"]>;

/** The ability boxes a row holds (`styles.abilityBox`'s width): a last row short of them is filled with empty ones. */
const ABILITIES_PER_ROW = 6;

/** The books' abilities' slugs, in their order: a sheet lists them first, then any other ability by name. */
const BOOK_ABILITY_ORDER = ABILITY_NAMES.map((name) => stripSeparators(name));

/**
 * A character's ability scores, a box each: the books' six first, then the others by name, whatever order their rows
 * came in. Each box is labeled by its abbreviation (STR, FOR), an ability other than the books' with its name under
 * it ("Force Points"), and gives its total, its modifier, and its base / levels / misc.
 */
function AbilityScores({ abilities }: { abilities: SheetAbilities }) {
  const byName = Object.entries(abilities).toSorted(([, a], [, b]) => a.name.localeCompare(b.name));
  const rows = sortByOrder(byName, BOOK_ABILITY_ORDER, ([key]) => key);
  // The last row's empty boxes, which keep its boxes under the first row's
  const fillers = (ABILITIES_PER_ROW - (rows.length % ABILITIES_PER_ROW)) % ABILITIES_PER_ROW;
  return (
    <View style={[styles.row, { justifyContent: "space-between" }]}>
      {rows.length === 0 && (
        <Text style={{ fontSize: FONT_SIZE.md, fontStyle: "italic", color: "#888" }}>No ability scores</Text>
      )}
      {rows.map(([key, ability]) => (
        <View key={key} style={styles.abilityBox}>
          <Text style={styles.abilityName}>{key.slice(0, 3).toUpperCase()}</Text>
          {!BOOK_ABILITY_ORDER.includes(key) && (
            <Text style={{ fontSize: FONT_SIZE.xs, color: "#666", textAlign: "center" }}>{ability.name}</Text>
          )}
          <Text style={styles.abilityScore}>{ability.total}</Text>
          <Text style={styles.abilityMod}>{SheetFormat.formatModifier(ability.modifier)}</Text>
          <Text style={{ fontSize: FONT_SIZE.xs, color: "#666", marginTop: 2, textAlign: "center" }}>
            {`${ability.base} / ${SheetFormat.formatModifier(ability.level)} / ${SheetFormat.formatModifier(ability.misc)}`}
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
