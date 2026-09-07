import type { Modifier, Requirement } from "@/shared/relations.ts";
import { formatPropertyType, stripSeparators } from "@/shared/utils.ts";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type DetailedCharacter from "./DetailedCharacter.ts";

// Helper function to format modifiers safely
const formatModifier = (value?: number): string => {
  if (value === undefined) return "+0";
  return value >= 0 ? `+${value}` : value.toString();
};

const FONT_SIZE = {
  xs: 6,
  sm: 7,
  base: 8,
  md: 9,
  lg: 10,
  xl: 11,
  xxl: 12,
  xxxl: 13,
  title: 16,
} as const;

// Canonical display order for spell properties, matching D&D 3.5 stat-block convention.
// Keys not in this list are appended alphabetically.
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
const styles = StyleSheet.create({
  page: {
    padding: 20,
    backgroundColor: "#ffffff",
    fontFamily: "Helvetica",
    fontSize: FONT_SIZE.md,
  },
  header: {
    marginBottom: 10,
    borderBottom: "1px solid #000",
    paddingBottom: 5,
    flexDirection: "column",
    width: "100%",
  },
  headerLeft: {
    width: "60%",
  },
  portrait: {
    width: 90,
    height: 80,
    objectFit: "cover",
    borderRadius: 4,
  },
  portraitPlaceholder: {
    width: 90,
    height: 80,
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#bbb",
    backgroundColor: "#f5f5f5",
    alignItems: "center",
    justifyContent: "center",
  },
  portraitPlaceholderText: {
    fontSize: FONT_SIZE.sm,
    color: "#999",
  },
  firstHeaderRight: {
    width: "40%",
    flexDirection: "column",
  },
  secondHeaderRight: {
    width: "40%",
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    textAlign: "right",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
    width: "100%",
  },
  headerLabel: {
    fontSize: FONT_SIZE.md,
    color: "#666",
  },
  headerValue: {
    fontSize: FONT_SIZE.md,
  },
  title: {
    fontSize: FONT_SIZE.title,
    fontWeight: "bold",
  },
  subtitle: {
    fontSize: FONT_SIZE.lg,
    marginTop: 2,
    color: "#444",
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: "bold",
    marginBottom: 4,
    borderBottom: "1px solid #888",
    paddingBottom: 2,
    color: "#333",
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 4,
  },
  column: {
    flexDirection: "column",
  },
  twoColumn: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  halfWidth: {
    width: "49%",
  },
  thirdWidth: {
    width: "32%",
  },
  abilityBox: {
    width: "16%",
    padding: 4,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#ccc",
    backgroundColor: "#f5f5f5",
    alignItems: "center",
  },
  abilityName: {
    fontWeight: "bold",
    fontSize: FONT_SIZE.md,
    marginBottom: 2,
  },
  abilityScore: {
    fontSize: FONT_SIZE.xxxl,
    fontWeight: "bold",
    marginVertical: 2,
  },
  abilityMod: {
    fontSize: FONT_SIZE.xl,
    fontWeight: "bold",
  },
  statBox: {
    width: "18%",
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 4,
    alignItems: "center",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: FONT_SIZE.sm,
    marginBottom: 2,
    color: "#666",
    textAlign: "center",
  },
  statValue: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: "bold",
  },
  savingThrowBox: {
    width: "32%",
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 4,
    alignItems: "center",
    backgroundColor: "#f0f8ff",
  },
  skillsContainer: {
    flexDirection: "column",
    width: "100%",
  },
  skillsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 2,
    marginBottom: 1,
    borderBottom: "1px solid #333",
    backgroundColor: "#ddd",
  },
  skillHeaderText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: "bold",
    color: "#333",
  },
  skillItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 1,
    paddingHorizontal: 2,
    borderBottom: "0.5px solid #eee",
  },
  skillNameContainer: {
    width: "32%",
    flexDirection: "row",
  },
  skillCheck: {
    width: "5%",
    fontSize: FONT_SIZE.base,
    textAlign: "center",
    fontWeight: "bold",
  },
  skillName: {
    fontSize: FONT_SIZE.base,
    width: "40%",
  },
  skillNameUntrained: {
    fontSize: FONT_SIZE.base,
    width: "40%",
    color: "#888",
  },
  skillAbility: {
    fontSize: FONT_SIZE.base,
    width: "12%",
    textAlign: "center",
  },
  skillAbilityUntrained: {
    fontSize: FONT_SIZE.base,
    width: "12%",
    textAlign: "center",
    color: "#888",
  },
  skillRank: {
    fontSize: FONT_SIZE.base,
    width: "12%",
    textAlign: "center",
  },
  skillRankUntrained: {
    fontSize: FONT_SIZE.base,
    width: "12%",
    textAlign: "center",
    color: "#888",
  },
  skillMod: {
    fontSize: FONT_SIZE.base,
    width: "12%",
    textAlign: "center",
  },
  skillModUntrained: {
    fontSize: FONT_SIZE.base,
    width: "12%",
    textAlign: "center",
    color: "#888",
  },
  skillOther: {
    fontSize: FONT_SIZE.base,
    width: "12%",
    textAlign: "center",
  },
  skillOtherUntrained: {
    fontSize: FONT_SIZE.base,
    width: "12%",
    textAlign: "center",
    color: "#888",
  },
  skillWeight: {
    fontSize: FONT_SIZE.base,
    width: "12%",
    textAlign: "center",
  },
  skillWeightUntrained: {
    fontSize: FONT_SIZE.base,
    width: "12%",
    textAlign: "center",
    color: "#888",
  },
  skillBonus: {
    fontSize: FONT_SIZE.base,
    width: "12%",
    textAlign: "center",
    fontWeight: "bold",
  },
  skillBonusUntrained: {
    fontSize: FONT_SIZE.base,
    width: "12%",
    textAlign: "center",
    fontWeight: "bold",
    color: "#888",
  },
  equipmentSection: {
    marginBottom: 4,
  },
  equipmentTitle: {
    fontWeight: "bold",
    fontSize: FONT_SIZE.md,
    marginBottom: 3,
    color: "#444",
    borderBottom: "0.5px solid #ccc",
    paddingBottom: 1,
  },
  equipmentItem: {
    fontSize: FONT_SIZE.base,
    marginBottom: 2,
  },
  featSection: {
    marginBottom: 5,
  },
  featName: {
    fontSize: FONT_SIZE.md,
    fontWeight: "bold",
  },
  featDesc: {
    fontSize: FONT_SIZE.sm,
    color: "#555",
    marginBottom: 3,
  },
  classInfo: {
    fontSize: FONT_SIZE.md,
    marginBottom: 2,
    padding: 3,
    borderBottom: "0.5px solid #ddd",
  },
  emptyMessage: {
    fontSize: FONT_SIZE.md,
    fontStyle: "italic",
    color: "#888",
    textAlign: "center",
    padding: 5,
  },
  footer: {
    position: "absolute",
    bottom: 10,
    left: 20,
    right: 20,
    padding: 5,
    borderTop: "0.5px solid #ccc",
    fontSize: FONT_SIZE.sm,
    color: "#888",
    textAlign: "center",
  },
  tableContainer: {
    borderWidth: 1,
    borderColor: "#ccc",
    marginBottom: 6,
  },
  tableHeader: {
    backgroundColor: "#eee",
    padding: 3,
    fontSize: FONT_SIZE.base,
    fontWeight: "bold",
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
    padding: 2,
  },
  tableCell: {
    fontSize: FONT_SIZE.base,
    padding: 2,
  },
  inventoryTable: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#ccc",
    marginTop: 5,
  },
  inventoryTableHeader: {
    flexDirection: "row",
    backgroundColor: "#eee",
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
    paddingVertical: 4,
  },
  inventoryTableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
    paddingVertical: 3,
  },
  inventoryItemCell: {
    width: "38%",
    paddingHorizontal: 4,
    fontSize: FONT_SIZE.base,
  },
  inventoryQuantityCell: {
    width: "10%",
    paddingHorizontal: 4,
    fontSize: FONT_SIZE.base,
    textAlign: "center",
  },
  inventoryWeightCell: {
    width: "12%",
    paddingHorizontal: 4,
    fontSize: FONT_SIZE.base,
    textAlign: "right",
  },
  inventoryValueCell: {
    width: "12%",
    paddingHorizontal: 4,
    fontSize: FONT_SIZE.base,
    textAlign: "right",
  },
  inventoryTotalValueCell: {
    width: "14%",
    paddingHorizontal: 4,
    fontSize: FONT_SIZE.base,
    textAlign: "right",
  },
  inventoryChargesCell: {
    width: "14%",
    paddingHorizontal: 4,
    fontSize: FONT_SIZE.base,
    textAlign: "center",
  },
  inventoryTableFooter: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    borderTopWidth: 1,
    borderTopColor: "#aaa",
    paddingVertical: 4,
    fontWeight: "bold",
  },
  inventoryHeaderText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: "bold",
    color: "#333",
  },
  inventoryFooterText: {
    fontSize: FONT_SIZE.base,
    fontWeight: "bold",
  },
  inventoryCategory: {
    fontSize: FONT_SIZE.md,
    fontWeight: "bold",
    color: "#333",
    marginTop: 8,
    marginBottom: 3,
    paddingBottom: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: "#aaa",
  },
  equippedItem: {
    fontWeight: "bold",
  },
  spellTableHeader: {
    flexDirection: "row",
    backgroundColor: "#eee",
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
    paddingVertical: 2,
  },
  spellHeaderText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: "bold",
    color: "#333",
    paddingHorizontal: 4,
  },
  spellRow: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  spellRowInner: {
    flexDirection: "row",
    paddingVertical: 1,
  },
  spellName: {
    fontSize: FONT_SIZE.base,
    width: "40%",
    paddingHorizontal: 4,
    fontWeight: "bold",
  },
  spellSchool: {
    fontSize: FONT_SIZE.base,
    width: "20%",
    paddingHorizontal: 4,
  },
  spellSave: {
    fontSize: FONT_SIZE.base,
    width: "30%",
    paddingHorizontal: 4,
  },
  spellDc: {
    fontSize: FONT_SIZE.base,
    width: "10%",
    paddingHorizontal: 4,
    textAlign: "center",
  },
  spellDetails: {
    paddingHorizontal: 8,
    paddingBottom: 2,
  },
  spellProperties: {
    fontSize: FONT_SIZE.sm,
    color: "#666",
  },
  spellDescription: {
    fontSize: FONT_SIZE.sm,
    color: "#444",
    marginTop: 2,
  },
});

// Character sheet component
const DetailedCharacterSheet = ({
  detailedCharacter,
  kind = "pc",
  portraitUrl,
}: {
  detailedCharacter: DetailedCharacter;
  kind?: "pc" | "familiar" | "animalcompanion" | "mount";
  portraitUrl?: string | null;
}) => {
  const isBonded = kind !== "pc";
  const ruleset = detailedCharacter.getRuleset();
  const identity = detailedCharacter.getDetailedCharacterIdentity();
  const abilities = detailedCharacter.getDetailedCharacterAbilities();
  const combat = detailedCharacter.getDetailedCharacterCombat();
  const savingThrows = detailedCharacter.getDetailedCharacterSavingThrows();
  const classes = detailedCharacter.getDetailedCharacterClasses();
  const inventory = detailedCharacter.getDetailedCharacterInventory();
  const skills = detailedCharacter.getDetailedCharacterSkills();
  const requirements = detailedCharacter.getDetailedCharacterRequirements();
  const powers = detailedCharacter.getDetailedCharacterPowers();
  const aptitudes = detailedCharacter.getDetailedCharacterAptitudes();

  const identityData = identity.getIdentity();
  const abilityData = abilities.getAbilities();
  const combatData = combat.getCombat();
  const savingThrowData = savingThrows.getSavingThrows();
  const classData = classes.getCharacterClasses();

  return (
    <Document>
      {/* First Page - Character Info */}
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{identityData.physiology.name}</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text style={styles.subtitle}>
              {identityData.physiology.race?.name || ""} {Object.values(classData)
                ?.map((cl) => `${cl.klass.name} (${cl.levels.length})`)
                .join(" / ") || ""}
            </Text>
            <Text style={styles.subtitle}>{ruleset?.name ?? "D&D 3.5e"}</Text>
          </View>
        </View>

        {/* Personal Details Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Details</Text>
          <View style={[styles.row, { justifyContent: "space-between", alignItems: "stretch", gap: 10 }]}>
            {portraitUrl
              ? <Image src={portraitUrl} style={styles.portrait} />
              : (
                <View style={styles.portraitPlaceholder}>
                  <Text style={styles.portraitPlaceholderText}>No image</Text>
                </View>
              )}
            <View style={{ width: "22%" }}>
              <View style={styles.headerRow}>
                <Text style={styles.headerLabel}>Experience:</Text>
                <Text style={styles.headerValue}>{identityData.meta.xp || 0}</Text>
              </View>
              <View style={styles.headerRow}>
                <Text style={styles.headerLabel}>Race:</Text>
                <Text style={styles.headerValue}>{identityData.physiology.race?.name || "—"}</Text>
              </View>
              <View style={styles.headerRow}>
                <Text style={styles.headerLabel}>Age:</Text>
                <Text style={styles.headerValue}>{identityData.physiology.age || "—"}</Text>
              </View>
              <View style={styles.headerRow}>
                <Text style={styles.headerLabel}>Height:</Text>
                <Text style={styles.headerValue}>
                  {identityData.physiology.height ? `${identityData.physiology.height} cm` : "—"}
                </Text>
              </View>
              <View style={styles.headerRow}>
                <Text style={styles.headerLabel}>Deity:</Text>
                <Text style={styles.headerValue}>{identityData.beliefs.deity || "—"}</Text>
              </View>
            </View>
            <View style={{ width: "22%" }}>
              <View style={styles.headerRow}>
                <Text style={styles.headerLabel}>Alignment:</Text>
                <Text style={styles.headerValue}>{identityData.beliefs.alignment || "Neutral"}</Text>
              </View>
              <View style={styles.headerRow}>
                <Text style={styles.headerLabel}>Gender:</Text>
                <Text style={styles.headerValue}>{identityData.physiology.gender || "—"}</Text>
              </View>
              <View style={styles.headerRow}>
                <Text style={styles.headerLabel}>Size:</Text>
                <Text style={styles.headerValue}>{identityData.physiology.race?.size || "Medium"}</Text>
              </View>
              <View style={styles.headerRow}>
                <Text style={styles.headerLabel}>Weight:</Text>
                <Text style={styles.headerValue}>
                  {identityData.physiology.weight ? `${identityData.physiology.weight} kg` : "—"}
                </Text>
              </View>
              <View style={styles.headerRow}>
                <Text style={styles.headerLabel}>Vision:</Text>
                <Text style={styles.headerValue}>Normal</Text>
              </View>
            </View>
          </View>
          {identityData.physiology.languages.length > 0 && (
            <Text style={[styles.headerValue, { marginTop: 6 }]}>
              <Text style={styles.headerLabel}>Languages: </Text>
              {identityData.physiology.languages.map((l) => l.name).join(", ")}
            </Text>
          )}
          <View style={{ marginTop: 6 }}>
            <View style={styles.headerRow}>
              <Text style={styles.headerLabel}>Description:</Text>
            </View>
            {identityData.physiology.description
              ? (
                <Text style={{ fontSize: FONT_SIZE.md, marginTop: 2, lineHeight: 1.4 }}>
                  {identityData.physiology.description}
                </Text>
              )
              : (
                <Text style={{ fontSize: FONT_SIZE.md, fontStyle: "italic", color: "#888" }}>—</Text>
              )}
          </View>
          <View style={{ marginTop: 6 }}>
            <View style={styles.headerRow}>
              <Text style={styles.headerLabel}>Notes:</Text>
            </View>
            {identityData.background?.notes
              ? (
                <Text style={{ fontSize: FONT_SIZE.md, marginTop: 2, lineHeight: 1.4 }}>
                  {identityData.background.notes}
                </Text>
              )
              : (
                <Text style={{ fontSize: FONT_SIZE.md, fontStyle: "italic", color: "#888" }}>—</Text>
              )}
          </View>
        </View>

        <View wrap={false}>
          <View style={styles.twoColumn}>
            {/* Left Column */}
            <View style={styles.halfWidth}>
              {/* Ability Scores */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Ability Scores</Text>
                <View style={[styles.row, { justifyContent: "space-between" }]}>
                  {([
                    { label: "STR", key: "strength", name: "Strength" },
                    { label: "DEX", key: "dexterity", name: "Dexterity" },
                    { label: "CON", key: "constitution", name: "Constitution" },
                    { label: "INT", key: "intelligence", name: "Intelligence" },
                    { label: "WIS", key: "wisdom", name: "Wisdom" },
                    { label: "CHA", key: "charisma", name: "Charisma" },
                  ] as const).map(({ label, key, name }) => {
                    const ab = abilityData[key];
                    return (
                      <View key={key} style={styles.abilityBox}>
                        <Text style={styles.abilityName}>{label}</Text>
                        <Text style={styles.abilityScore}>{ab?.total ?? 10}</Text>
                        <Text style={styles.abilityMod}>
                          {formatModifier(abilities.getAbilityModifier(name))}
                        </Text>
                        <Text style={{ fontSize: FONT_SIZE.xs, color: "#666", marginTop: 2, textAlign: "center" }}>
                          {`${ab?.base ?? 10} / ${ab?.level ? `+${ab.level}` : "+0"} / ${ab?.misc ? formatModifier(ab.misc) : "+0"}`}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Saving Throws */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Saving Throws</Text>
                <View style={[styles.row, { justifyContent: "space-between" }]}>
                  {Object.values(savingThrowData).map((save) => (
                    <View key={save.name} style={styles.savingThrowBox}>
                      <Text style={styles.abilityName}>{save.name}</Text>
                      <Text style={styles.abilityMod}>
                        {formatModifier(save.total)}
                      </Text>
                      <Text style={{ fontSize: FONT_SIZE.xs, color: "#666", marginTop: 2, textAlign: "center" }}>
                        {`Base ${formatModifier(save.base)}  |  Abil ${formatModifier(save.ability)}  |  Misc ${formatModifier(save.misc)}`}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {/* Right Column */}
            <View style={styles.halfWidth}>
              {/* Combat Stats */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Combat Stats</Text>
                <View
                  style={[
                    styles.row,
                    { flexWrap: "wrap", justifyContent: "space-between" },
                  ]}
                >
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>HP</Text>
                    <Text style={styles.statValue}>{combatData.hp.total}</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>AC</Text>
                    <Text style={styles.statValue}>{combatData.ac.total}</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Touch AC</Text>
                    <Text style={styles.statValue}>{combatData.ac.touch}</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Flat-footed</Text>
                    <Text style={styles.statValue}>{combatData.ac.flatfooted}</Text>
                  </View>
                </View>
                <View style={{ marginBottom: 4 }}>
                  <Text style={{ fontSize: FONT_SIZE.xs, color: "#666", textAlign: "center" }}>
                    {`Arm ${formatModifier(combatData.ac.armor ?? 0)}  Shld ${formatModifier(combatData.ac.shield ?? 0)}  Dex ${formatModifier(combatData.ac.dexterity ?? 0)}  Nat ${formatModifier(combatData.ac.natural ?? 0)}  Defl ${formatModifier(combatData.ac.deflection ?? 0)}  Misc ${formatModifier(combatData.ac.misc ?? 0)}`}
                  </Text>
                </View>
                <View
                  style={[
                    styles.row,
                    { flexWrap: "wrap", justifyContent: "space-between" },
                  ]}
                >
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Initiative</Text>
                    <Text style={styles.statValue}>
                      {formatModifier(combatData.initiative.total)}
                    </Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>BAB</Text>
                    <Text style={styles.statValue}>
                      {(() => {
                        const attacks: string[] = [];
                        for (let b = combatData.bab; b > 0; b -= 5) attacks.push(formatModifier(b));
                        return attacks.length > 0 ? attacks.join("/") : formatModifier(combatData.bab);
                      })()}
                    </Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Grapple</Text>
                    <Text style={styles.statValue}>
                      {formatModifier(combatData.grapple.total)}
                    </Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Speed</Text>
                    <Text style={styles.statValue}>
                      {combatData.speed.total} ft.
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* Weapons & Combat */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Weapons & Combat</Text>
            {Object.entries(combatData.weaponsets)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([setIndex, set]) => {
                const weapons = (["mainhand", "offhand", "twohanded"] as const)
                  .map((slotKey) => ({ slotKey, weapon: set[slotKey] }))
                  .filter(({ weapon }) => weapon !== null);

                if (weapons.length === 0) return null;

                return (
                  <View key={setIndex} style={{ marginBottom: 6 }}>
                    <Text style={{ fontSize: FONT_SIZE.md, fontWeight: "bold", marginBottom: 3, color: "#444" }}>
                      Set {Number(setIndex) + 1}
                    </Text>
                    <View style={[styles.tableRow, styles.tableHeader]}>
                      <Text style={[styles.tableCell, { width: "27%", fontWeight: "bold" }]}>
                        Weapon
                      </Text>
                      <Text style={[styles.tableCell, { width: "18%", fontWeight: "bold" }]}>
                        Attack Bonus
                      </Text>
                      <Text style={[styles.tableCell, { width: "18%", fontWeight: "bold" }]}>
                        Damage
                      </Text>
                      <Text style={[styles.tableCell, { width: "13%", fontWeight: "bold" }]}>
                        Critical
                      </Text>
                      <Text style={[styles.tableCell, { width: "11%", fontWeight: "bold" }]}>
                        Range
                      </Text>
                      <Text style={[styles.tableCell, { width: "13%", fontWeight: "bold" }]}>
                        Type
                      </Text>
                    </View>
                    {weapons.map(({ slotKey, weapon }) => (
                      <View key={slotKey} style={styles.tableRow}>
                        <View style={[styles.tableCell, { width: "27%" }]}>
                          <Text>{weapon!.name}</Text>
                          <Text style={{ fontSize: FONT_SIZE.sm, color: "#666" }}>
                            {slotKey === "mainhand" ? "Main Hand" : slotKey === "offhand" ? "Off Hand" : "Two Handed"}
                          </Text>
                          {weapon!.proficient === false && (
                            <Text style={{ fontSize: FONT_SIZE.xs, color: "#cc0000", fontWeight: "bold" }}>Not Proficient (-4)</Text>
                          )}
                        </View>
                        <Text style={[styles.tableCell, { width: "18%" }]}>
                          {weapon!.tohit.total.map(formatModifier).join("/")}
                        </Text>
                        <Text style={[styles.tableCell, { width: "18%" }]}>
                          {weapon!.damage.total}
                        </Text>
                        <Text style={[styles.tableCell, { width: "13%" }]}>
                          {21 - weapon!.damage.critical.range}/x{weapon!.damage.critical.multiplier}
                        </Text>
                        <Text style={[styles.tableCell, { width: "11%" }]}>
                          {weapon!.range ? `${weapon!.range} ft.` : "Melee"}
                        </Text>
                        <Text style={[styles.tableCell, { width: "13%" }]}>
                          {weapon!.damage.types.join(", ")}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              })}
          </View>
        </View>

      </Page>

      {/* Second Page - Skills */}
      <Page size="A4" style={styles.page}>
        {/* Header with character name for the second page */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>
              {identityData.physiology.name || "Unnamed Character"}
            </Text>
          </View>
        </View>

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
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 12 }}>
              <Text style={{ fontSize: FONT_SIZE.sm, color: "#666", fontStyle: "italic" }}>
                * = Class Skill
              </Text>
              <Text style={{ fontSize: FONT_SIZE.sm, color: "#333" }}>
                Skill Points: {detailedCharacter.getDetailedCharacterSkills().getSkillBudget().spent || 0} /{" "}
                {detailedCharacter.getDetailedCharacterSkills().getSkillBudget().total || 0}
              </Text>
            </View>
          </View>

          {(() => {
            const skillsData = skills.getSkills();
            const skillEntries = Object.values(skillsData);

            if (!skillEntries || skillEntries.length === 0) {
              return <Text style={styles.emptyMessage}>No skills available</Text>;
            }

            const sorted = [...skillEntries].sort((a, b) => a.name.localeCompare(b.name));
            const half = Math.ceil(sorted.length / 2);
            const columns = [sorted.slice(0, half), sorted.slice(half)];

            const renderHeader = () => (
              <View style={styles.skillsHeader}>
                <Text style={[styles.skillHeaderText, { width: "40%" }]}>SKILL</Text>
                <Text style={[styles.skillHeaderText, { width: "12%", textAlign: "center" }]}>
                  RANK
                </Text>
                <Text style={[styles.skillHeaderText, { width: "12%", textAlign: "center" }]}>
                  MOD
                </Text>
                <Text style={[styles.skillHeaderText, { width: "12%", textAlign: "center" }]}>
                  MISC
                </Text>
                <Text style={[styles.skillHeaderText, { width: "12%", textAlign: "center" }]}>
                  WGT
                </Text>
                <Text style={[styles.skillHeaderText, { width: "12%", textAlign: "center" }]}>
                  TOTAL
                </Text>
              </View>
            );

            return (
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                {columns.map((column, colIndex) => (
                  <View key={colIndex} style={{ width: "49%" }}>
                    {renderHeader()}
                    {column.map((skill, index) => (
                      <View key={index} style={styles.skillItem}>
                        <Text
                          style={[skill.trained ? styles.skillName : styles.skillNameUntrained, {
                            width: "40%",
                          }]}
                        >
                          {skill.name}
                          {skill.innate ? "*" : ""}
                        </Text>
                        <Text style={skill.trained ? styles.skillRank : styles.skillRankUntrained}>
                          {skill.rank}
                        </Text>
                        <Text style={skill.trained ? styles.skillMod : styles.skillModUntrained}>
                          {formatModifier(skill.ability)}
                        </Text>
                        <Text
                          style={skill.trained ? styles.skillOther : styles.skillOtherUntrained}
                        >
                          {skill.misc !== 0 ? formatModifier(skill.misc) : "—"}
                        </Text>
                        <Text
                          style={skill.trained ? styles.skillWeight : styles.skillWeightUntrained}
                        >
                          {skill.weight ? `-${skill.weight}` : "—"}
                        </Text>
                        <Text
                          style={skill.trained ? styles.skillBonus : styles.skillBonusUntrained}
                        >
                          {formatModifier(skill.total)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            );
          })()}
        </View>

      </Page>

      {/* Third Page - Feats & Abilities */}
      <Page size="A4" style={styles.page}>
        {/* Header with character name for the third page */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>
              {identityData.physiology.name || "Unnamed Character"}
            </Text>
          </View>
        </View>

        {/* Feats & Abilities Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Feats & Abilities</Text>
          {(() => {
            const allFeats = Object.values(classData).flatMap((klass) =>
              klass.levels.flatMap((level) => level.feats)
            );

            const groupedFeats = allFeats.reduce((acc, feat) => {
              if (!acc[feat.name]) acc[feat.name] = [];
              acc[feat.name].push(feat);
              return acc;
            }, {} as Record<string, typeof allFeats>);

            const featEntries: { key: string; label: string; description: string }[] = [];
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

            for (const feat of detailedCharacter.getVirtuallyPossessedFeats()) {
              featEntries.push({
                key: `virtual-${feat.id}`,
                label: feat.name,
                description: feat.description || "—",
              });
            }

            if (featEntries.length === 0) {
              return <Text style={styles.emptyMessage}>No feats available</Text>;
            }

            const columns: typeof featEntries[] = [[], []];
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
                        <Text style={{ fontWeight: "bold", color: "#000" }}>{entry.label}.</Text>
                        {" "}
                        {entry.description}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            );
          })()}
        </View>

      </Page>

      {/* Fourth Page - Spells */}
      {(() => {
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
          for (const level of (klass.levels || [])) {
            for (const power of (level.powers || [])) {
              const spellLevel = power.powerLevel ?? level.klassLevel?.level ?? 0;
              const aptitudeName = aptitudeNameById.get(power.aptitudeId) || "Spells";
              const groupKey = `${power.aptitudeId}:${spellLevel}`;

              const normalizedName = stripSeparators(power.name);
              const powerData = powersData[normalizedName];

              const save = power.saveName && power.saveEffect
                ? `${power.saveName} ${power.saveEffect}`
                : power.saveEffect || "None";

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
              const row: SpellRow = { name: power.name, school, save, dc, description, properties, tags: tags?.length ? tags : undefined };

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
                groupMap.set(groupKey, { aptitudeName, level: spellLevel, uses: getUsesPerDay(aptitudeName, spellLevel), spells: [row] });
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
            save: entry.saveName && entry.power.saveEffect ? `${entry.saveName} ${entry.power.saveEffect}` : entry.power.saveEffect || "None",
            dc: entry.dc,
            description: entry.power.description || "",
            properties,
          };
          const existing = groupMap.get(groupKey);
          if (existing) {
            existing.spells.push(row);
          } else {
            groupMap.set(groupKey, { aptitudeName, level: entry.level, uses: getUsesPerDay(aptitudeName, entry.level), spells: [row] });
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

        const sorted = [...byAptitude.values()].sort((a, b) =>
          a.aptitudeName.localeCompare(b.aptitudeName),
        );
        for (const apt of sorted) {
          apt.levels.sort((a, b) => a.level - b.level);
        }

        if (sorted.length === 0) return null;

        return (
          <Page size="A4" style={styles.page}>
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Text style={styles.title}>
                  {identityData.physiology.name || "Unnamed Character"}
                </Text>
              </View>
            </View>

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
                const legendEntries = SPELL_PROPERTY_ORDER
                  .filter((key) => presentKeys.has(key))
                  .map((key) => SPELL_PROPERTY_ABBR[key]);
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
                      <Text style={{ fontSize: FONT_SIZE.md, fontWeight: "bold", marginBottom: 1, marginTop: 2, color: "#555" }}>
                        {group.level === 0 ? "Cantrips" : `Level ${group.level}`}
                        {group.uses != null ? ` — ${group.uses}/day` : ""}
                      </Text>

                      {/* Table header */}
                      <View style={styles.spellTableHeader}>
                        <Text style={[styles.spellHeaderText, { width: "40%" }]}>
                          NAME
                        </Text>
                        <Text style={[styles.spellHeaderText, { width: "20%" }]}>
                          SCHOOL
                        </Text>
                        <Text style={[styles.spellHeaderText, { width: "30%" }]}>
                          SAVE
                        </Text>
                        <Text style={[styles.spellHeaderText, { width: "10%", textAlign: "center" }]}>
                          DC
                        </Text>
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
                                  <Text key={tag} style={{ fontSize: FONT_SIZE.xs, fontWeight: "normal", color: tag.includes("Domain") ? "#9c27b0" : "#1976d2" }}> [{tag}]</Text>
                                ))}
                              </Text>
                              <Text style={styles.spellSchool}>
                                {spell.school}
                              </Text>
                              <Text style={styles.spellSave}>
                                {spell.save}
                              </Text>
                              <Text style={styles.spellDc}>
                                {spell.dc ?? "—"}
                              </Text>
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
                                        </Text>
                                        {" "}
                                        {value}
                                      </Text>
                                    ))}
                                  </Text>
                                )}
                                {spell.description && (
                                  <Text style={styles.spellDescription}>
                                    {spell.description}
                                  </Text>
                                )}
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
      })()}

      {/* Inventory Page */}
      {!isBonded && <Page size="A4" style={styles.page}>
        {/* Header with character name for the fourth page */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>{identityData.physiology.name}</Text>
          </View>
        </View>

        {/* Inventory Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Inventory</Text>

          {(() => {
            const flatItems = inventory.getFlatInventory();

            return flatItems.length > 0
              ? (
                <View style={styles.inventoryTable}>
                  <View style={styles.inventoryTableHeader}>
                    <Text style={[styles.inventoryHeaderText, { width: "26%", paddingHorizontal: 4 }]}>ITEM</Text>
                    <Text style={[styles.inventoryHeaderText, { width: "6%", paddingHorizontal: 2, textAlign: "center" }]}>QTY</Text>
                    <Text style={[styles.inventoryHeaderText, { width: "12%", paddingHorizontal: 2 }]}>SLOT</Text>
                    <Text style={[styles.inventoryHeaderText, { width: "8%", paddingHorizontal: 2, textAlign: "right" }]}>WT</Text>
                    <Text style={[styles.inventoryHeaderText, { width: "8%", paddingHorizontal: 2, textAlign: "right" }]}>VALUE</Text>
                    <Text style={[styles.inventoryHeaderText, { width: "10%", paddingHorizontal: 2, textAlign: "center" }]}>CHARGES</Text>
                    <Text style={[styles.inventoryHeaderText, { width: "30%", paddingHorizontal: 4 }]}>DESCRIPTION</Text>
                  </View>

                  {flatItems.map((entry, i) => (
                    <View key={i} style={[styles.inventoryTableRow, !entry.equipped ? { backgroundColor: "#fafafa" } : {}]}>
                      <View style={{ width: "26%", paddingHorizontal: 4 }}>
                        <Text style={{ fontSize: FONT_SIZE.base, fontWeight: entry.equipped ? "bold" : "normal" }}>
                          {entry.item.name}
                        </Text>
                        {!entry.equipped && (
                          <Text style={{ fontSize: FONT_SIZE.xs, color: "#888" }}>unequipped</Text>
                        )}
                      </View>
                      <Text style={{ fontSize: FONT_SIZE.base, width: "6%", paddingHorizontal: 2, textAlign: "center" }}>
                        {entry.quantity}
                      </Text>
                      <Text style={{ fontSize: FONT_SIZE.base, width: "12%", paddingHorizontal: 2 }}>
                        {entry.location ?? "—"}
                      </Text>
                      <Text style={{ fontSize: FONT_SIZE.base, width: "8%", paddingHorizontal: 2, textAlign: "right" }}>
                        {entry.item.weight ? `${parseFloat(entry.item.weight)} lb` : "—"}
                      </Text>
                      <Text style={{ fontSize: FONT_SIZE.base, width: "8%", paddingHorizontal: 2, textAlign: "right" }}>
                        {entry.item.costGp ? `${parseFloat(entry.item.costGp)} gp` : "—"}
                      </Text>
                      <Text style={{ fontSize: FONT_SIZE.base, width: "10%", paddingHorizontal: 2, textAlign: "center" }}>
                        {entry.totalCharges != null ? `${entry.remainingCharges ?? 0}/${entry.totalCharges}` : "—"}
                      </Text>
                      <Text style={{ fontSize: FONT_SIZE.sm, width: "30%", paddingHorizontal: 4, color: "#555" }}>
                        {entry.item.description || "—"}
                      </Text>
                    </View>
                  ))}
                  {/* Weight Summary Footer */}
                  <View style={styles.inventoryTableFooter}>
                    <Text style={[styles.inventoryFooterText, { width: "44%", paddingHorizontal: 4 }]}>
                      Carried Weight: {combatData.encumbrance.carriedweight} lbs
                    </Text>
                    <Text style={[styles.inventoryFooterText, { width: "14%", paddingHorizontal: 2, fontWeight: "normal" }]}>
                      Light: {combatData.encumbrance.lightload}
                    </Text>
                    <Text style={[styles.inventoryFooterText, { width: "14%", paddingHorizontal: 2, fontWeight: "normal" }]}>
                      Medium: {combatData.encumbrance.mediumload}
                    </Text>
                    <Text style={[styles.inventoryFooterText, { width: "14%", paddingHorizontal: 2, fontWeight: "normal" }]}>
                      Heavy: {combatData.encumbrance.heavyload}
                    </Text>
                    {combatData.encumbrance.load !== "light" && (
                      <Text style={[styles.inventoryFooterText, { width: "14%", paddingHorizontal: 2, color: combatData.encumbrance.load === "overloaded" ? "#d32f2f" : combatData.encumbrance.load === "heavy" ? "#ed6c02" : "#0288d1" }]}>
                        {combatData.encumbrance.load.charAt(0).toUpperCase() + combatData.encumbrance.load.slice(1)}
                      </Text>
                    )}
                  </View>
                </View>
              )
              : <Text style={styles.emptyMessage}>No items in inventory</Text>;
          })()}
        </View>

      </Page>}

      {/* Fifth Page - Diagnostics (dev only) */}
      {process.env.NODE_ENV !== "production" && <Page size="A4" style={styles.page}>
        {/* Header with character name for the fifth page */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>{identityData.physiology.name}</Text>
          </View>
          <View style={styles.secondHeaderRight}>
            <Text style={styles.headerLabel}>
              System Data
            </Text>
          </View>
        </View>

        {/* Requirements System Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Requirements System Status</Text>

          {(() => {
            const requirementsData = requirements.getRequirements();
            const invalidRequirements = requirementsData.invalidRequirements;
            const unmetRequirementGroups = requirementsData.unmetRequirementGroups;
            const fulfilledRequirementGroups = requirementsData.fulfilledRequirementGroups;

            return (
              <View>
                {/* Status Summary */}
                <View
                  style={{
                    marginBottom: 10,
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ fontSize: FONT_SIZE.md, color: "#333" }}>
                    Total Requirement Groups:{" "}
                    {fulfilledRequirementGroups.length + unmetRequirementGroups.length}
                  </Text>
                  <Text style={{ fontSize: FONT_SIZE.md, color: "#008800" }}>
                    Fulfilled: {fulfilledRequirementGroups.length}
                  </Text>
                  <Text style={{ fontSize: FONT_SIZE.md, color: "#cc0000" }}>
                    Unmet: {unmetRequirementGroups.length}
                  </Text>
                  <Text style={{ fontSize: FONT_SIZE.md, color: "#cc9900" }}>
                    Invalid: {invalidRequirements.length}
                  </Text>
                </View>

                {/* Unmet Requirements Table */}
                {unmetRequirementGroups.length > 0 && (
                  <View style={{ marginBottom: 10 }}>
                    <Text
                      style={{
                        fontSize: FONT_SIZE.lg,
                        fontWeight: "bold",
                        marginBottom: 5,
                      }}
                    >
                      Unmet Requirements
                    </Text>
                    <View style={{ width: "100%", borderWidth: 1, borderColor: "#ccc" }}>
                      {/* Header Row */}
                      <View
                        style={{
                          flexDirection: "row",
                          backgroundColor: "#eee",
                          borderBottomWidth: 1,
                          borderBottomColor: "#ccc",
                          paddingVertical: 4,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "15%",
                            paddingHorizontal: 4,
                          }}
                        >
                          LEVEL
                        </Text>
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "35%",
                            paddingHorizontal: 4,
                          }}
                        >
                          TARGET
                        </Text>
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "15%",
                            paddingHorizontal: 4,
                            textAlign: "center",
                          }}
                        >
                          OPERATOR
                        </Text>
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "15%",
                            paddingHorizontal: 4,
                            textAlign: "center",
                          }}
                        >
                          VALUE
                        </Text>
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "20%",
                            paddingHorizontal: 4,
                            textAlign: "center",
                          }}
                        >
                          CHAINING OP
                        </Text>
                      </View>

                      {/* Unmet Requirements Data */}
                      {unmetRequirementGroups.slice(0, 15).flatMap((group, groupIndex) =>
                        group.map((requirement, reqIndex) => (
                          <View
                            key={`${groupIndex}-${reqIndex}`}
                            style={{
                              flexDirection: "row",
                              borderBottomWidth: 0.5,
                              borderBottomColor: "#eee",
                              paddingVertical: 3,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: FONT_SIZE.base,
                                width: "15%",
                                paddingHorizontal: 4,
                              }}
                            >
                              {requirement.level}
                            </Text>
                            <Text
                              style={{
                                fontSize: FONT_SIZE.base,
                                width: "35%",
                                paddingHorizontal: 4,
                              }}
                            >
                              {requirement.target || "—"}
                            </Text>
                            <Text
                              style={{
                                fontSize: FONT_SIZE.base,
                                width: "15%",
                                paddingHorizontal: 4,
                                textAlign: "center",
                              }}
                            >
                              {requirement.operator || "—"}
                            </Text>
                            <Text
                              style={{
                                fontSize: FONT_SIZE.base,
                                width: "15%",
                                paddingHorizontal: 4,
                                textAlign: "center",
                              }}
                            >
                              {requirement.value || "—"}
                            </Text>
                            <Text
                              style={{
                                fontSize: FONT_SIZE.base,
                                width: "20%",
                                paddingHorizontal: 4,
                                textAlign: "center",
                              }}
                            >
                              {requirement.chainingOperator || "—"}
                            </Text>
                          </View>
                        ))
                      )}

                      {unmetRequirementGroups.flatMap((group) => group).length > 15 && (
                        <View style={{ padding: 5, backgroundColor: "#f5f5f5" }}>
                          <Text style={{ fontSize: FONT_SIZE.base, color: "#666", textAlign: "center" }}>
                            ... and {unmetRequirementGroups.flatMap((group) =>
                              group
                            ).length - 15} more unmet requirements
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {/* Fulfilled Requirements Table */}
                {fulfilledRequirementGroups.length > 0 && (
                  <View style={{ marginBottom: 10 }}>
                    <Text
                      style={{
                        fontSize: FONT_SIZE.lg,
                        fontWeight: "bold",
                        marginBottom: 5,
                      }}
                    >
                      Fulfilled Requirements
                    </Text>
                    <View style={{ width: "100%", borderWidth: 1, borderColor: "#ccc" }}>
                      {/* Header Row */}
                      <View
                        style={{
                          flexDirection: "row",
                          backgroundColor: "#eee",
                          borderBottomWidth: 1,
                          borderBottomColor: "#ccc",
                          paddingVertical: 4,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "15%",
                            paddingHorizontal: 4,
                          }}
                        >
                          LEVEL
                        </Text>
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "35%",
                            paddingHorizontal: 4,
                          }}
                        >
                          TARGET
                        </Text>
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "15%",
                            paddingHorizontal: 4,
                            textAlign: "center",
                          }}
                        >
                          OPERATOR
                        </Text>
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "15%",
                            paddingHorizontal: 4,
                            textAlign: "center",
                          }}
                        >
                          VALUE
                        </Text>
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "20%",
                            paddingHorizontal: 4,
                            textAlign: "center",
                          }}
                        >
                          CHAINING OP
                        </Text>
                      </View>

                      {/* Fulfilled Requirements Data */}
                      {fulfilledRequirementGroups.slice(0, 15).flatMap((group, groupIndex) =>
                        group.map((requirement, reqIndex) => (
                          <View
                            key={`fulfilled-${groupIndex}-${reqIndex}`}
                            style={{
                              flexDirection: "row",
                              borderBottomWidth: 0.5,
                              borderBottomColor: "#eee",
                              paddingVertical: 3,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: FONT_SIZE.base,
                                width: "15%",
                                paddingHorizontal: 4,
                              }}
                            >
                              {requirement.level}
                            </Text>
                            <Text
                              style={{
                                fontSize: FONT_SIZE.base,
                                width: "35%",
                                paddingHorizontal: 4,
                              }}
                            >
                              {requirement.target || "—"}
                            </Text>
                            <Text
                              style={{
                                fontSize: FONT_SIZE.base,
                                width: "15%",
                                paddingHorizontal: 4,
                                textAlign: "center",
                              }}
                            >
                              {requirement.operator || "—"}
                            </Text>
                            <Text
                              style={{
                                fontSize: FONT_SIZE.base,
                                width: "15%",
                                paddingHorizontal: 4,
                                textAlign: "center",
                              }}
                            >
                              {requirement.value || "—"}
                            </Text>
                            <Text
                              style={{
                                fontSize: FONT_SIZE.base,
                                width: "20%",
                                paddingHorizontal: 4,
                                textAlign: "center",
                              }}
                            >
                              {requirement.chainingOperator || "—"}
                            </Text>
                          </View>
                        ))
                      )}

                      {fulfilledRequirementGroups.flatMap((group) => group).length > 15 && (
                        <View style={{ padding: 5, backgroundColor: "#f5f5f5" }}>
                          <Text style={{ fontSize: FONT_SIZE.base, color: "#666", textAlign: "center" }}>
                            ... and {fulfilledRequirementGroups.flatMap((group) =>
                              group
                            ).length - 15} more fulfilled requirements
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {/* Invalid Requirements Table */}
                {invalidRequirements.length > 0 && (
                  <View>
                    <Text
                      style={{
                        fontSize: FONT_SIZE.lg,
                        fontWeight: "bold",
                        marginBottom: 5,
                      }}
                    >
                      Invalid Requirements
                    </Text>
                    <View style={{ width: "100%", borderWidth: 1, borderColor: "#ccc" }}>
                      {/* Header Row */}
                      <View
                        style={{
                          flexDirection: "row",
                          backgroundColor: "#eee",
                          borderBottomWidth: 1,
                          borderBottomColor: "#ccc",
                          paddingVertical: 4,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "20%",
                            paddingHorizontal: 4,
                          }}
                        >
                          LEVEL
                        </Text>
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "35%",
                            paddingHorizontal: 4,
                          }}
                        >
                          TARGET
                        </Text>
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "45%",
                            paddingHorizontal: 4,
                          }}
                        >
                          WARNING MESSAGE
                        </Text>
                      </View>

                      {/* Invalid Requirements Data */}
                      {invalidRequirements.map((
                        invalidItem: { warning: string; requirement: Requirement },
                        index: number,
                      ) => (
                        <View
                          key={index}
                          style={{
                            flexDirection: "row",
                            borderBottomWidth: 0.5,
                            borderBottomColor: "#eee",
                            paddingVertical: 3,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: FONT_SIZE.base,
                              width: "20%",
                              paddingHorizontal: 4,
                            }}
                          >
                            {invalidItem.requirement.level}
                          </Text>
                          <Text
                            style={{
                              fontSize: FONT_SIZE.base,
                              width: "35%",
                              paddingHorizontal: 4,
                            }}
                          >
                            {invalidItem.requirement.target || "—"}
                          </Text>
                          <Text
                            style={{
                              fontSize: FONT_SIZE.base,
                              width: "45%",
                              paddingHorizontal: 4,
                            }}
                          >
                            {invalidItem.warning}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {unmetRequirementGroups.length === 0 && fulfilledRequirementGroups.length === 0 &&
                  invalidRequirements.length === 0 && (
                  <Text style={styles.emptyMessage}>No requirements found</Text>
                )}
              </View>
            );
          })()}
        </View>

        {/* Modifier System Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Modifier System Status</Text>

          {(() => {
            const modifiers = detailedCharacter.getDetailedCharacterModifiers();
            const skippedModifiers = modifiers.getModifiers().skippedModifiers;
            const appliedModifiers = modifiers.getModifiers().appliedModifiers;
            const unappliedModifiers = modifiers.getModifiers().unappliedModifiers;
            const inactiveModifiers = modifiers.getModifiers().inactiveModifiers;
            const allModifiers = modifiers.getModifiers().modifiers;

            return (
              <View>
                {/* Status Summary */}
                <View
                  style={{
                    marginBottom: 10,
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ fontSize: FONT_SIZE.md, color: "#333" }}>
                    Total Modifiers: {allModifiers.length}
                  </Text>
                  <Text style={{ fontSize: FONT_SIZE.md, color: "#008800" }}>
                    Applied: {appliedModifiers.length}
                  </Text>
                  <Text style={{ fontSize: FONT_SIZE.md, color: "#cc0000" }}>
                    Unapplied: {unappliedModifiers.length}
                  </Text>
                  <Text style={{ fontSize: FONT_SIZE.md, color: "#666699" }}>
                    Inactive: {inactiveModifiers.length}
                  </Text>
                  <Text style={{ fontSize: FONT_SIZE.md, color: "#cc9900" }}>
                    Skipped: {skippedModifiers.length}
                  </Text>
                </View>

                {/* Applied Modifiers Table */}
                {appliedModifiers.length > 0 && (
                  <View style={{ marginBottom: 10 }}>
                    <Text
                      style={{
                        fontSize: FONT_SIZE.lg,
                        fontWeight: "bold",
                        marginBottom: 5,
                      }}
                    >
                      Applied Modifiers
                    </Text>
                    <View style={{ width: "100%", borderWidth: 1, borderColor: "#ccc" }}>
                      {/* Header Row */}
                      <View
                        style={{
                          flexDirection: "row",
                          backgroundColor: "#eee",
                          borderBottomWidth: 1,
                          borderBottomColor: "#ccc",
                          paddingVertical: 4,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "20%",
                            paddingHorizontal: 4,
                          }}
                        >
                          SOURCE TYPE
                        </Text>
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "35%",
                            paddingHorizontal: 4,
                          }}
                        >
                          TARGET
                        </Text>
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "15%",
                            paddingHorizontal: 4,
                            textAlign: "center",
                          }}
                        >
                          OPERATOR
                        </Text>
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "15%",
                            paddingHorizontal: 4,
                            textAlign: "center",
                          }}
                        >
                          VALUE
                        </Text>
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "15%",
                            paddingHorizontal: 4,
                            textAlign: "center",
                          }}
                        >
                          TYPE
                        </Text>
                      </View>

                      {/* Applied Modifiers Data */}
                      {appliedModifiers.slice(0, 10).map((modifier: Modifier, index: number) => (
                        <View
                          key={index}
                          style={{
                            flexDirection: "row",
                            borderBottomWidth: 0.5,
                            borderBottomColor: "#eee",
                            paddingVertical: 3,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: FONT_SIZE.base,
                              width: "20%",
                              paddingHorizontal: 4,
                            }}
                          >
                            {modifier.sourceType}
                          </Text>
                          <Text
                            style={{
                              fontSize: FONT_SIZE.base,
                              width: "35%",
                              paddingHorizontal: 4,
                            }}
                          >
                            {modifier.target}
                          </Text>
                          <Text
                            style={{
                              fontSize: FONT_SIZE.base,
                              width: "15%",
                              paddingHorizontal: 4,
                              textAlign: "center",
                            }}
                          >
                            {modifier.operator}
                          </Text>
                          <Text
                            style={{
                              fontSize: FONT_SIZE.base,
                              width: "15%",
                              paddingHorizontal: 4,
                              textAlign: "center",
                            }}
                          >
                            {modifier.value}
                          </Text>
                          <Text
                            style={{
                              fontSize: FONT_SIZE.base,
                              width: "15%",
                              paddingHorizontal: 4,
                              textAlign: "center",
                            }}
                          >
                            {modifier.valueType}
                          </Text>
                        </View>
                      ))}

                      {appliedModifiers.length > 10 && (
                        <View style={{ padding: 5, backgroundColor: "#f5f5f5" }}>
                          <Text style={{ fontSize: FONT_SIZE.base, color: "#666", textAlign: "center" }}>
                            ... and {appliedModifiers.length - 10} more applied modifiers
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {/* Unapplied Modifiers Table */}
                {unappliedModifiers.length > 0 && (
                  <View style={{ marginBottom: 10 }}>
                    <Text
                      style={{
                        fontSize: FONT_SIZE.lg,
                        fontWeight: "bold",
                        marginBottom: 5,
                      }}
                    >
                      Unapplied Modifiers (Requirements Not Met)
                    </Text>
                    <View style={{ width: "100%", borderWidth: 1, borderColor: "#ccc" }}>
                      {/* Header Row */}
                      <View
                        style={{
                          flexDirection: "row",
                          backgroundColor: "#eee",
                          borderBottomWidth: 1,
                          borderBottomColor: "#ccc",
                          paddingVertical: 4,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "20%",
                            paddingHorizontal: 4,
                          }}
                        >
                          SOURCE TYPE
                        </Text>
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "35%",
                            paddingHorizontal: 4,
                          }}
                        >
                          TARGET
                        </Text>
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "15%",
                            paddingHorizontal: 4,
                            textAlign: "center",
                          }}
                        >
                          OPERATOR
                        </Text>
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "15%",
                            paddingHorizontal: 4,
                            textAlign: "center",
                          }}
                        >
                          VALUE
                        </Text>
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "15%",
                            paddingHorizontal: 4,
                            textAlign: "center",
                          }}
                        >
                          TYPE
                        </Text>
                      </View>

                      {/* Unapplied Modifiers Data */}
                      {unappliedModifiers.slice(0, 10).map((modifier: Modifier, index: number) => (
                        <View
                          key={index}
                          style={{
                            flexDirection: "row",
                            borderBottomWidth: 0.5,
                            borderBottomColor: "#eee",
                            paddingVertical: 3,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: FONT_SIZE.base,
                              width: "20%",
                              paddingHorizontal: 4,
                            }}
                          >
                            {modifier.sourceType}
                          </Text>
                          <Text
                            style={{
                              fontSize: FONT_SIZE.base,
                              width: "35%",
                              paddingHorizontal: 4,
                            }}
                          >
                            {modifier.target}
                          </Text>
                          <Text
                            style={{
                              fontSize: FONT_SIZE.base,
                              width: "15%",
                              paddingHorizontal: 4,
                              textAlign: "center",
                            }}
                          >
                            {modifier.operator}
                          </Text>
                          <Text
                            style={{
                              fontSize: FONT_SIZE.base,
                              width: "15%",
                              paddingHorizontal: 4,
                              textAlign: "center",
                            }}
                          >
                            {modifier.value}
                          </Text>
                          <Text
                            style={{
                              fontSize: FONT_SIZE.base,
                              width: "15%",
                              paddingHorizontal: 4,
                              textAlign: "center",
                            }}
                          >
                            {modifier.valueType}
                          </Text>
                        </View>
                      ))}

                      {unappliedModifiers.length > 10 && (
                        <View style={{ padding: 5, backgroundColor: "#f5f5f5" }}>
                          <Text style={{ fontSize: FONT_SIZE.base, color: "#666", textAlign: "center" }}>
                            ... and {unappliedModifiers.length - 10} more unapplied modifiers
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {/* Inactive Modifiers Table */}
                {inactiveModifiers.length > 0 && (
                  <View style={{ marginBottom: 10 }}>
                    <Text
                      style={{
                        fontSize: FONT_SIZE.lg,
                        fontWeight: "bold",
                        marginBottom: 5,
                      }}
                    >
                      Inactive Modifiers (Target Not Equipped)
                    </Text>
                    <View style={{ width: "100%", borderWidth: 1, borderColor: "#ccc" }}>
                      {/* Header Row */}
                      <View
                        style={{
                          flexDirection: "row",
                          backgroundColor: "#eee",
                          borderBottomWidth: 1,
                          borderBottomColor: "#ccc",
                          paddingVertical: 4,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "20%",
                            paddingHorizontal: 4,
                          }}
                        >
                          SOURCE TYPE
                        </Text>
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "35%",
                            paddingHorizontal: 4,
                          }}
                        >
                          TARGET
                        </Text>
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "15%",
                            paddingHorizontal: 4,
                            textAlign: "center",
                          }}
                        >
                          OPERATOR
                        </Text>
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "15%",
                            paddingHorizontal: 4,
                            textAlign: "center",
                          }}
                        >
                          VALUE
                        </Text>
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "15%",
                            paddingHorizontal: 4,
                            textAlign: "center",
                          }}
                        >
                          TYPE
                        </Text>
                      </View>

                      {/* Inactive Modifiers Data */}
                      {inactiveModifiers.slice(0, 10).map((modifier: Modifier, index: number) => (
                        <View
                          key={index}
                          style={{
                            flexDirection: "row",
                            borderBottomWidth: 0.5,
                            borderBottomColor: "#eee",
                            paddingVertical: 3,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: FONT_SIZE.base,
                              width: "20%",
                              paddingHorizontal: 4,
                            }}
                          >
                            {modifier.sourceType}
                          </Text>
                          <Text
                            style={{
                              fontSize: FONT_SIZE.base,
                              width: "35%",
                              paddingHorizontal: 4,
                            }}
                          >
                            {modifier.target}
                          </Text>
                          <Text
                            style={{
                              fontSize: FONT_SIZE.base,
                              width: "15%",
                              paddingHorizontal: 4,
                              textAlign: "center",
                            }}
                          >
                            {modifier.operator}
                          </Text>
                          <Text
                            style={{
                              fontSize: FONT_SIZE.base,
                              width: "15%",
                              paddingHorizontal: 4,
                              textAlign: "center",
                            }}
                          >
                            {modifier.value}
                          </Text>
                          <Text
                            style={{
                              fontSize: FONT_SIZE.base,
                              width: "15%",
                              paddingHorizontal: 4,
                              textAlign: "center",
                            }}
                          >
                            {modifier.valueType}
                          </Text>
                        </View>
                      ))}

                      {inactiveModifiers.length > 10 && (
                        <View style={{ padding: 5, backgroundColor: "#f5f5f5" }}>
                          <Text style={{ fontSize: FONT_SIZE.base, color: "#666", textAlign: "center" }}>
                            ... and {inactiveModifiers.length - 10} more inactive modifiers
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {/* Skipped Modifiers Table */}
                {skippedModifiers.length > 0 && (
                  <View>
                    <Text
                      style={{
                        fontSize: FONT_SIZE.lg,
                        fontWeight: "bold",
                        marginBottom: 5,
                      }}
                    >
                      Skipped Modifiers
                    </Text>
                    <View style={{ width: "100%", borderWidth: 1, borderColor: "#ccc" }}>
                      {/* Header Row */}
                      <View
                        style={{
                          flexDirection: "row",
                          backgroundColor: "#eee",
                          borderBottomWidth: 1,
                          borderBottomColor: "#ccc",
                          paddingVertical: 4,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "25%",
                            paddingHorizontal: 4,
                          }}
                        >
                          SOURCE TYPE
                        </Text>
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "35%",
                            paddingHorizontal: 4,
                          }}
                        >
                          TARGET
                        </Text>
                        <Text
                          style={{
                            fontSize: FONT_SIZE.sm,
                            fontWeight: "bold",
                            color: "#333",
                            width: "40%",
                            paddingHorizontal: 4,
                          }}
                        >
                          WARNING MESSAGE
                        </Text>
                      </View>

                      {/* Skipped Modifiers Data */}
                      {skippedModifiers.map((
                        skippedItem: { warning: string; modifier: Modifier },
                        index: number,
                      ) => (
                        <View
                          key={index}
                          style={{
                            flexDirection: "row",
                            borderBottomWidth: 0.5,
                            borderBottomColor: "#eee",
                            paddingVertical: 3,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: FONT_SIZE.base,
                              width: "25%",
                              paddingHorizontal: 4,
                            }}
                          >
                            {skippedItem.modifier.sourceType}
                          </Text>
                          <Text
                            style={{
                              fontSize: FONT_SIZE.base,
                              width: "35%",
                              paddingHorizontal: 4,
                            }}
                          >
                            {skippedItem.modifier.target}
                          </Text>
                          <Text
                            style={{
                              fontSize: FONT_SIZE.base,
                              width: "40%",
                              paddingHorizontal: 4,
                            }}
                          >
                            {skippedItem.warning}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {skippedModifiers.length === 0 && appliedModifiers.length === 0 &&
                  unappliedModifiers.length === 0 && inactiveModifiers.length === 0 && (
                  <Text style={styles.emptyMessage}>No modifiers found</Text>
                )}
              </View>
            );
          })()}
        </View>

      </Page>}
    </Document>
  );
};

export default DetailedCharacterSheet;
