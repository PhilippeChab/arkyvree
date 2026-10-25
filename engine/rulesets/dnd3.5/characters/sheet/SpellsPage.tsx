import { Page, Text, View } from "@react-pdf/renderer";

import SpellGroups from "@/engine/rulesets/dnd3.5/characters/description/SpellGroups.ts";
import { SPELL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/spells/fields.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { formatFieldName } from "@/shared/customization/fields.ts";
import {
  SPELL_AREA_OF_EFFECT,
  SPELL_CASTING_TIME,
  SPELL_COMPONENT,
  SPELL_DESCRIPTOR,
  SPELL_DURATION,
  SPELL_EFFECT,
  SPELL_RANGE_TYPE,
  SPELL_RESISTANCE,
  SPELL_SCHOOL,
  SPELL_SUBSCHOOL,
  SPELL_TARGET,
} from "@/vocabulary/dnd3.5/properties/index.ts";
import { SPELL_LEVEL_LABELS } from "@/vocabulary/dnd3.5/spells.ts";

import ContinuationHeader from "./ContinuationHeader.tsx";
import SpellsPerDayTable from "./SpellsPerDayTable.tsx";
import { FONT_SIZE, styles } from "./styles.ts";

/**
 * Short labels so each spell's row of fields fits on a single line. A legend at the top of the spells section spells
 * each one out as its field's label.
 */
const SPELL_FIELD_ABBR: Record<string, string> = {
  [SPELL_SUBSCHOOL]: "SS",
  [SPELL_DESCRIPTOR]: "Desc",
  [SPELL_COMPONENT]: "Comp",
  [SPELL_CASTING_TIME]: "CT",
  [SPELL_RANGE_TYPE]: "R",
  [SPELL_TARGET]: "T",
  [SPELL_EFFECT]: "Eff",
  [SPELL_AREA_OF_EFFECT]: "Area",
  [SPELL_DURATION]: "Dur",
  [SPELL_RESISTANCE]: "SR",
};

/** Each spell field's label, as it's declared. */
const SPELL_FIELD_LABELS = new Map<string, string>(
  Object.values(SPELL_FIELDS.fields).map((field) => [field.field, field.label]),
);
/** The spell fields in a 3.5 stat block's order (the order they're declared in); the others follow by name. */
const SPELL_FIELD_ORDER: string[] = Object.values(SPELL_FIELDS.fields).map((field) => field.field);

const SPELL_FIELD_ORDER_INDEX = new Map(SPELL_FIELD_ORDER.map((k, i) => [k, i]));

/**
 * The sheet's spells page: the character's slots per day, then the spells it knows and has without a pick, by list and
 * spell level.
 */
function SpellsPage({ detailedCharacter }: { detailedCharacter: DetailedCharacter }) {
  const identityData = detailedCharacter.components.identity.getIdentity();
  const sorted = SpellGroups.describe(detailedCharacter);
  const perDay = SpellGroups.describePerDay(detailedCharacter);

  if (sorted.length === 0 && perDay.lists.length === 0) return null;

  return (
    <Page size="A4" style={styles.page}>
      <ContinuationHeader name={identityData.physiology.name} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Spells</Text>

        <SpellsPerDayTable perDay={perDay} />

        {(() => {
          const presentKeys = new Set<string>();
          for (const apt of sorted) {
            for (const group of apt.levels) {
              for (const spell of group.spells) {
                for (const key of Object.keys(spell.fields))
                  if (key !== SPELL_SCHOOL && SPELL_FIELD_ABBR[key]) presentKeys.add(key);
              }
            }
          }
          const legendEntries = SPELL_FIELD_ORDER.filter((key) => presentKeys.has(key)).map((key) => ({
            full: SPELL_FIELD_LABELS.get(key),
            short: SPELL_FIELD_ABBR[key],
          }));
          if (legendEntries.length === 0) return null;
          return (
            <Text style={{ fontSize: FONT_SIZE.sm, color: "#666", fontStyle: "italic", marginBottom: 4 }}>
              {legendEntries.map((e, i) => (
                <Text key={e.short}>
                  {i > 0 ? " · " : ""}
                  <Text style={{ fontWeight: "bold", fontStyle: "normal", color: "#333" }}>{e.short}</Text>
                  {" = "}
                  {e.full}
                </Text>
              ))}
            </Text>
          );
        })()}

        {sorted.map((apt) => (
          <View key={apt.aptitudeName} style={{ marginBottom: 4 }}>
            <Text style={{ fontSize: FONT_SIZE.lg, fontWeight: "bold", marginBottom: 2, color: "#333" }}>
              {apt.aptitudeName}
            </Text>

            {apt.levels.map((group) => (
              <View key={group.level} style={{ marginBottom: 3 }}>
                <Text
                  style={{
                    fontSize: FONT_SIZE.md,
                    fontWeight: "bold",
                    marginBottom: 1,
                    marginTop: 2,
                    color: "#555",
                  }}
                >
                  {SPELL_LEVEL_LABELS[group.level]}
                  {group.uses != null ? ` — ${group.uses}/day` : ""}
                </Text>

                {/* Table header */}
                <View style={styles.spellTableHeader}>
                  <Text style={[styles.spellHeaderText, { width: "40%" }]}>NAME</Text>
                  <Text style={[styles.spellHeaderText, { width: "20%" }]}>SCHOOL</Text>
                  <Text style={[styles.spellHeaderText, { width: "30%" }]}>SAVE</Text>
                  <Text style={[styles.spellHeaderText, { width: "10%", textAlign: "center" }]}>DC</Text>
                </View>

                {/* Spell rows */}
                {group.spells.map((spell) => {
                  const detailFields = Object.entries(spell.fields)
                    .filter(([key]) => key !== SPELL_SCHOOL)
                    .sort(([a], [b]) => {
                      const ai = SPELL_FIELD_ORDER_INDEX.get(a) ?? SPELL_FIELD_ORDER.length;
                      const bi = SPELL_FIELD_ORDER_INDEX.get(b) ?? SPELL_FIELD_ORDER.length;
                      return ai !== bi ? ai - bi : a.localeCompare(b);
                    });

                  return (
                    <View key={spell.name} style={styles.spellRow}>
                      <View style={styles.spellRowInner}>
                        <Text style={styles.spellName}>
                          {spell.name}
                          {spell.tags?.map((tag) => (
                            <Text
                              key={tag.name}
                              style={{
                                fontSize: FONT_SIZE.xs,
                                fontWeight: "normal",
                                color: tag.joinsClassList ? "#9c27b0" : "#1976d2",
                              }}
                            >
                              {" "}
                              [{tag.name}]
                            </Text>
                          ))}
                        </Text>
                        <Text style={styles.spellSchool}>{spell.school}</Text>
                        <Text style={styles.spellSave}>{spell.save}</Text>
                        <Text style={styles.spellDc}>{spell.dc ?? "—"}</Text>
                      </View>
                      {(detailFields.length > 0 || spell.description) && (
                        <View style={styles.spellDetails}>
                          {detailFields.length > 0 && (
                            <Text style={styles.spellFields}>
                              {detailFields.map(([key, value], i) => (
                                <Text key={key}>
                                  {i > 0 ? " • " : ""}
                                  <Text style={{ fontWeight: "bold", color: "#333" }}>
                                    {SPELL_FIELD_ABBR[key] ?? formatFieldName(key)}
                                  </Text>{" "}
                                  {value}
                                </Text>
                              ))}
                            </Text>
                          )}
                          {spell.description && <Text style={styles.spellDescription}>{spell.description}</Text>}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        ))}
      </View>
    </Page>
  );
}

export default SpellsPage;
