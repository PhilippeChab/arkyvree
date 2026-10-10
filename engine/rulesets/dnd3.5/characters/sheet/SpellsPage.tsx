import { Page, Text, View } from "@react-pdf/renderer";

import SpellGroups from "@/engine/rulesets/dnd3.5/characters/description/SpellGroups.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { formatPropertyType } from "@/shared/customization/properties.ts";
import {
  ENTITY_PROPERTY_TYPES,
  SPELL_AREA_OF_EFFECT,
  SPELL_CASTING_TIME,
  SPELL_COMPONENT,
  SPELL_DESCRIPTOR,
  SPELL_DURATION,
  SPELL_DURATION_TYPE,
  SPELL_EFFECT,
  SPELL_MATERIAL,
  SPELL_RANGE_TYPE,
  SPELL_RESISTANCE,
  SPELL_SCHOOL,
  SPELL_SUBSCHOOL,
  SPELL_TARGET,
} from "@/vocabulary/dnd3.5/properties/index.ts";
import { SPELL_LEVEL_LABELS } from "@/vocabulary/dnd3.5/spells.ts";

import ContinuationHeader from "./ContinuationHeader.tsx";
import { FONT_SIZE, styles } from "./styles.ts";

/**
 * Short labels so each spell's property row fits on a single line. A legend is rendered once at the top of the spells
 * section.
 */
const SPELL_PROPERTY_ABBR: Record<string, { full: string; short: string }> = {
  [SPELL_SUBSCHOOL]: { short: "SS", full: "Subschool" },
  [SPELL_DESCRIPTOR]: { short: "Desc", full: "Descriptor" },
  [SPELL_COMPONENT]: { short: "Comp", full: "Components" },
  [SPELL_MATERIAL]: { short: "Mat", full: "Material" },
  [SPELL_CASTING_TIME]: { short: "CT", full: "Casting Time" },
  [SPELL_RANGE_TYPE]: { short: "R", full: "Range" },
  [SPELL_TARGET]: { short: "T", full: "Target" },
  [SPELL_EFFECT]: { short: "Eff", full: "Effect" },
  [SPELL_AREA_OF_EFFECT]: { short: "Area", full: "Area of Effect" },
  [SPELL_DURATION_TYPE]: { short: "DT", full: "Duration Type" },
  [SPELL_DURATION]: { short: "Dur", full: "Duration" },
  [SPELL_RESISTANCE]: { short: "SR", full: "Spell Resistance" },
};
/** The spell properties in a 3.5 stat block's order (the property types' registry); the others follow by name. */
const SPELL_PROPERTY_ORDER = Object.keys(ENTITY_PROPERTY_TYPES.powers ?? {});

const SPELL_PROPERTY_ORDER_INDEX = new Map(SPELL_PROPERTY_ORDER.map((k, i) => [k, i]));

/** The sheet's spells page: the spells the character knows and has without a pick, by list and spell level. */
function SpellsPage({ detailedCharacter }: { detailedCharacter: DetailedCharacter }) {
  const identityData = detailedCharacter.components.identity.getIdentity();
  const sorted = SpellGroups.describe(detailedCharacter);

  if (sorted.length === 0) return null;

  return (
    <Page size="A4" style={styles.page}>
      <ContinuationHeader name={identityData.physiology.name} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Spells</Text>

        {(() => {
          const presentKeys = new Set<string>();
          for (const apt of sorted) {
            for (const group of apt.levels) {
              for (const spell of group.spells) {
                for (const key of Object.keys(spell.properties))
                  if (key !== SPELL_SCHOOL && SPELL_PROPERTY_ABBR[key]) presentKeys.add(key);
              }
            }
          }
          const legendEntries = SPELL_PROPERTY_ORDER.filter((key) => presentKeys.has(key)).map(
            (key) => SPELL_PROPERTY_ABBR[key],
          );
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
                  const detailProps = Object.entries(spell.properties)
                    .filter(([key]) => key !== SPELL_SCHOOL)
                    .sort(([a], [b]) => {
                      const ai = SPELL_PROPERTY_ORDER_INDEX.get(a) ?? SPELL_PROPERTY_ORDER.length;
                      const bi = SPELL_PROPERTY_ORDER_INDEX.get(b) ?? SPELL_PROPERTY_ORDER.length;
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
                      {(detailProps.length > 0 || spell.description) && (
                        <View style={styles.spellDetails}>
                          {detailProps.length > 0 && (
                            <Text style={styles.spellProperties}>
                              {detailProps.map(([key, value], i) => (
                                <Text key={key}>
                                  {i > 0 ? " • " : ""}
                                  <Text style={{ fontWeight: "bold", color: "#333" }}>
                                    {SPELL_PROPERTY_ABBR[key]?.short ?? formatPropertyType(key)}
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
