import { Image, Page, Text, View } from "@react-pdf/renderer";

import CombatSheet from "@/engine/rulesets/dnd3.5/characters/description/CombatSheet.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";

import SheetFormat from "./SheetFormat.ts";
import { FONT_SIZE, styles } from "./styles.ts";

/** The parts of the AC the breakdown lists, by their short label */
const AC_PARTS = [
  ["Arm", "armor"],
  ["Shld", "shield"],
  ["Dex", "dexterity"],
  ["Nat", "natural"],
  ["Defl", "deflection"],
  ["Dodge", "dodge"],
  ["Size", "size"],
  ["Misc", "misc"],
] as const;

/** The sheet's first page: who the character is, its ability scores, saving throws, combat stats and weapons. */
function InfoPage({
  detailedCharacter,
  portraitUrl,
}: {
  detailedCharacter: DetailedCharacter;
  portraitUrl?: string | null;
}) {
  const ruleset = detailedCharacter.getRuleset();
  const identity = detailedCharacter.components.identity;
  const abilities = detailedCharacter.components.abilities;
  const combat = detailedCharacter.components.combat;
  const saves = detailedCharacter.components.saves;
  const classes = detailedCharacter.components.classes;
  const identityData = identity.getIdentity();
  const abilityData = abilities.getAbilities();
  const combatData = CombatSheet.describe(combat);
  const saveData = saves.getSaves();
  const classData = classes.getCharacterClasses();
  return (
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{identityData.physiology.name}</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <Text style={styles.subtitle}>
            {identityData.physiology.race?.name || ""}{" "}
            {Object.values(classData)
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
          {portraitUrl ? (
            <Image src={portraitUrl} style={styles.portrait} />
          ) : (
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
              {/* Free text, as the player wrote it: "180 cm", "5'11"" */}
              <Text style={styles.headerValue}>{identityData.physiology.height || "—"}</Text>
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
              <Text style={styles.headerValue}>{identityData.physiology.weight || "—"}</Text>
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
          {identityData.physiology.description ? (
            <Text style={{ fontSize: FONT_SIZE.md, marginTop: 2, lineHeight: 1.4 }}>
              {identityData.physiology.description}
            </Text>
          ) : (
            <Text style={{ fontSize: FONT_SIZE.md, fontStyle: "italic", color: "#888" }}>—</Text>
          )}
        </View>
        <View style={{ marginTop: 6 }}>
          <View style={styles.headerRow}>
            <Text style={styles.headerLabel}>Notes:</Text>
          </View>
          {identityData.background?.notes ? (
            <Text style={{ fontSize: FONT_SIZE.md, marginTop: 2, lineHeight: 1.4 }}>
              {identityData.background.notes}
            </Text>
          ) : (
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
                {(
                  [
                    { label: "STR", key: "strength", name: "Strength" },
                    { label: "DEX", key: "dexterity", name: "Dexterity" },
                    { label: "CON", key: "constitution", name: "Constitution" },
                    { label: "INT", key: "intelligence", name: "Intelligence" },
                    { label: "WIS", key: "wisdom", name: "Wisdom" },
                    { label: "CHA", key: "charisma", name: "Charisma" },
                  ] as const
                ).map(({ label, key, name }) => {
                  const ab = abilityData[key];
                  return (
                    <View key={key} style={styles.abilityBox}>
                      <Text style={styles.abilityName}>{label}</Text>
                      <Text style={styles.abilityScore}>{ab?.total ?? 10}</Text>
                      <Text style={styles.abilityMod}>
                        {SheetFormat.formatModifier(abilities.getAbilityModifier(name))}
                      </Text>
                      <Text style={{ fontSize: FONT_SIZE.xs, color: "#666", marginTop: 2, textAlign: "center" }}>
                        {`${ab?.base ?? 10} / ${SheetFormat.formatModifier(ab?.level)} / ${SheetFormat.formatModifier(ab?.misc)}`}
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
                {Object.values(saveData).map((save) => (
                  <View key={save.name} style={styles.saveBox}>
                    <Text style={styles.abilityName}>{save.name}</Text>
                    <Text style={styles.abilityMod}>{SheetFormat.formatModifier(save.total)}</Text>
                    <Text style={{ fontSize: FONT_SIZE.xs, color: "#666", marginTop: 2, textAlign: "center" }}>
                      {`Base ${SheetFormat.formatModifier(save.base)}  |  Abil ${SheetFormat.formatModifier(save.ability)}  |  Misc ${SheetFormat.formatModifier(save.misc)}`}
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
              <View style={[styles.row, { flexWrap: "wrap", justifyContent: "space-between" }]}>
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
                  {AC_PARTS.map(
                    ([label, part]) => `${label} ${SheetFormat.formatModifier(combatData.ac[part] ?? 0)}`,
                  ).join("  ")}
                </Text>
              </View>
              <View style={[styles.row, { flexWrap: "wrap", justifyContent: "space-between" }]}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Initiative</Text>
                  <Text style={styles.statValue}>{SheetFormat.formatModifier(combatData.initiative.total)}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>BAB</Text>
                  <Text style={styles.statValue}>{combatData.babLabel}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Grapple</Text>
                  <Text style={styles.statValue}>{SheetFormat.formatModifier(combatData.grapple.total)}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Speed</Text>
                  <Text style={styles.statValue}>{combatData.speedLabel}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Weapons & Combat */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weapons & Combat</Text>
          {combatData.weaponSets.map(({ set, weapons }) => (
            <View key={set} style={{ marginBottom: 6 }}>
              <Text style={{ fontSize: FONT_SIZE.md, fontWeight: "bold", marginBottom: 3, color: "#444" }}>
                Set {set + 1}
              </Text>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={[styles.tableCell, { width: "27%", fontWeight: "bold" }]}>Weapon</Text>
                <Text style={[styles.tableCell, { width: "18%", fontWeight: "bold" }]}>Attack Bonus</Text>
                <Text style={[styles.tableCell, { width: "18%", fontWeight: "bold" }]}>Damage</Text>
                <Text style={[styles.tableCell, { width: "13%", fontWeight: "bold" }]}>Critical</Text>
                <Text style={[styles.tableCell, { width: "11%", fontWeight: "bold" }]}>Range</Text>
                <Text style={[styles.tableCell, { width: "13%", fontWeight: "bold" }]}>Type</Text>
              </View>
              {weapons.flatMap((weapon) =>
                weapon.rows.map((row) => (
                  <View key={row.key} style={styles.tableRow}>
                    <View style={[styles.tableCell, { width: "27%" }]}>
                      <Text>{weapon.name}</Text>
                      <Text style={{ fontSize: FONT_SIZE.sm, color: "#666" }}>{row.label}</Text>
                      {weapon.proficient === false && (
                        <Text style={{ fontSize: FONT_SIZE.xs, color: "#cc0000", fontWeight: "bold" }}>
                          Not Proficient (-4)
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.tableCell, { width: "18%" }]}>{row.attack}</Text>
                    <Text style={[styles.tableCell, { width: "18%" }]}>{row.damage}</Text>
                    <Text style={[styles.tableCell, { width: "13%" }]}>{row.critical}</Text>
                    <Text style={[styles.tableCell, { width: "11%" }]}>{row.range}</Text>
                    <Text style={[styles.tableCell, { width: "13%" }]}>{row.types}</Text>
                  </View>
                )),
              )}
            </View>
          ))}
        </View>
      </View>
    </Page>
  );
}

export default InfoPage;
