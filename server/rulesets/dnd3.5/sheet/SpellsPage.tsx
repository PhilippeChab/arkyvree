import { Page, Text, View } from "@react-pdf/renderer";

import type DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";
import { formatPropertyType } from "@/shared/customization/properties.ts";
import { stripSeparators } from "@/shared/text.ts";

import ContinuationHeader from "./ContinuationHeader.tsx";
import { FONT_SIZE, styles } from "./styles.ts";

const SPELL_PROPERTY_ORDER = [
  "SPELL_SUBSCHOOL",
  "SPELL_DESCRIPTOR",
  "SPELL_COMPONENT",
  "SPELL_MATERIAL",
  "SPELL_CASTING_TIME",
  "SPELL_RANGE_TYPE",
  "SPELL_TARGET",
  "SPELL_AREA_OF_EFFECT",
  "SPELL_DURATION_TYPE",
  "SPELL_DURATION",
  "SPELL_RESISTANCE",
];
const SPELL_PROPERTY_ORDER_INDEX = new Map(SPELL_PROPERTY_ORDER.map((k, i) => [k, i]));

// Short labels so each spell's property row fits on a single line. A legend is rendered
// once at the top of the spells section.
const SPELL_PROPERTY_ABBR: Record<string, { short: string; full: string }> = {
  SPELL_SUBSCHOOL: { short: "SS", full: "Subschool" },
  SPELL_DESCRIPTOR: { short: "Desc", full: "Descriptor" },
  SPELL_COMPONENT: { short: "Comp", full: "Components" },
  SPELL_MATERIAL: { short: "Mat", full: "Material" },
  SPELL_CASTING_TIME: { short: "CT", full: "Casting Time" },
  SPELL_RANGE_TYPE: { short: "R", full: "Range" },
  SPELL_TARGET: { short: "T", full: "Target" },
  SPELL_AREA_OF_EFFECT: { short: "Area", full: "Area of Effect" },
  SPELL_DURATION_TYPE: { short: "DT", full: "Duration Type" },
  SPELL_DURATION: { short: "Dur", full: "Duration" },
  SPELL_RESISTANCE: { short: "SR", full: "Spell Resistance" },
};

// Define styles (reusing the same styles from the original)

const SpellsPage = ({ detailedCharacter }: { detailedCharacter: DetailedCharacter }) => {
  const identity = detailedCharacter.getDetailedCharacterIdentity();
  const classes = detailedCharacter.getDetailedCharacterClasses();
  const powers = detailedCharacter.getDetailedCharacterPowers();
  const aptitudes = detailedCharacter.getDetailedCharacterAptitudes();
  const identityData = identity.getIdentity();
  const classData = classes.getCharacterClasses();

  const SCHOOL_KEY = "SPELL_SCHOOL";
  const powersData = powers.getFlatPowers();
  const aptitudesData = aptitudes.getAptitudes();
  const spellTagsData = detailedCharacter.getSpellTags();

  const aptitudeNameById = new Map<string, string>();
  for (const apt of Object.values(aptitudesData)) {
    if (apt.id) aptitudeNameById.set(apt.id, apt.name);
  }

  interface SpellRow {
    name: string;
    school: string;
    save: string;
    dc: number | null;
    description: string;
    properties: Record<string, string>;
    tags?: string[];
  }

  interface SpellGroup {
    aptitudeName: string;
    level: number;
    uses: number | null;
    spells: SpellRow[];
  }

  const getUsesPerDay = (aptitudeName: string, spellLevel: number): number | null => {
    const key = stripSeparators(aptitudeName);
    const apt = aptitudesData[key] as Record<string, unknown> | undefined;
    if (!apt) return null;
    const levelData = apt[String(spellLevel)] as { uses?: number } | undefined;
    if (!levelData || levelData.uses == null) return null;
    return levelData.uses;
  };

  const groupMap = new Map<string, SpellGroup>();

  for (const klass of Object.values(classData)) {
    for (const level of klass.levels || []) {
      for (const power of level.powers || []) {
        const spellLevel = power.powerLevel ?? level.klassLevel?.level ?? 0;
        const aptitudeName = aptitudeNameById.get(power.aptitudeId) || "Spells";
        const groupKey = `${power.aptitudeId}:${spellLevel}`;

        const normalizedName = stripSeparators(power.name);
        const powerData = powersData[normalizedName];

        const save =
          power.saveName && power.saveEffect ? `${power.saveName} ${power.saveEffect}` : power.saveEffect || "None";

        const properties = powerData?.properties ?? {};
        const school = properties[SCHOOL_KEY] || "—";
        const dc = powerData?.dc?.total ?? null;
        const description = powerData?.power.description || power.description || "";

        const allTags = power.id ? spellTagsData[power.id] : undefined;
        const tags = allTags?.filter((tag: string) => {
          if (tag.includes("Domain")) return aptitudeName.includes("Cleric") || aptitudeName.includes("Domain");
          if (tag.includes("Specialist")) return aptitudeName.includes("Wizard") || aptitudeName.includes("Specialist");
          return true;
        });
        const row: SpellRow = {
          name: power.name,
          school,
          save,
          dc,
          description,
          properties,
          tags: tags?.length ? tags : undefined,
        };

        const existing = groupMap.get(groupKey);
        if (existing) {
          const existingSpell = existing.spells.find((r) => r.name === power.name);
          if (existingSpell) {
            if (row.tags) {
              existingSpell.tags = [...new Set([...(existingSpell.tags || []), ...row.tags])];
            }
          } else {
            existing.spells.push(row);
          }
        } else {
          groupMap.set(groupKey, {
            aptitudeName,
            level: spellLevel,
            uses: getUsesPerDay(aptitudeName, spellLevel),
            spells: [row],
          });
        }
      }
    }
  }

  // Add virtually possessed spells (granted by modifiers, not picked)
  for (const entry of detailedCharacter.getVirtuallyPossessedPowersWithAptitudes()) {
    const aptitudeName = aptitudeNameById.get(entry.aptitudeId) || "Spells";
    const groupKey = `${entry.aptitudeId}:${entry.level}`;
    const properties: Record<string, string> = {};
    for (const prop of entry.properties) {
      properties[prop.type] = prop.value;
    }
    const row: SpellRow = {
      name: entry.power.name,
      school: properties[SCHOOL_KEY] || "—",
      save:
        entry.saveName && entry.power.saveEffect
          ? `${entry.saveName} ${entry.power.saveEffect}`
          : entry.power.saveEffect || "None",
      dc: entry.dc,
      description: entry.power.description || "",
      properties,
    };
    const existing = groupMap.get(groupKey);
    if (existing) {
      existing.spells.push(row);
    } else {
      groupMap.set(groupKey, {
        aptitudeName,
        level: entry.level,
        uses: getUsesPerDay(aptitudeName, entry.level),
        spells: [row],
      });
    }
  }

  const byAptitude = new Map<string, { aptitudeName: string; levels: SpellGroup[] }>();
  for (const group of groupMap.values()) {
    group.spells.sort((a, b) => a.name.localeCompare(b.name));
    const existing = byAptitude.get(group.aptitudeName);
    if (existing) {
      existing.levels.push(group);
    } else {
      byAptitude.set(group.aptitudeName, { aptitudeName: group.aptitudeName, levels: [group] });
    }
  }

  const sorted = [...byAptitude.values()].sort((a, b) => a.aptitudeName.localeCompare(b.aptitudeName));
  for (const apt of sorted) {
    apt.levels.sort((a, b) => a.level - b.level);
  }

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
                for (const key of Object.keys(spell.properties)) {
                  if (key !== SCHOOL_KEY && SPELL_PROPERTY_ABBR[key]) {
                    presentKeys.add(key);
                  }
                }
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
                  {group.level === 0 ? "Cantrips" : `Level ${group.level}`}
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
                    .filter(([key]) => key !== SCHOOL_KEY)
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
                              key={tag}
                              style={{
                                fontSize: FONT_SIZE.xs,
                                fontWeight: "normal",
                                color: tag.includes("Domain") ? "#9c27b0" : "#1976d2",
                              }}
                            >
                              {" "}
                              [{tag}]
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
};

export default SpellsPage;
