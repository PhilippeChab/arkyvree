import { Image, Page, Text, View } from "@react-pdf/renderer";

import ClassLevels from "@/engine/rulesets/dnd3.5/characters/ClassLevels.ts";
import CombatSheet from "@/engine/rulesets/dnd3.5/characters/description/CombatSheet.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { RACE_SIZE } from "@/vocabulary/dnd3.5/fields/index.ts";

import AbilityScores from "./AbilityScores.tsx";
import SheetFormat from "./SheetFormat.ts";
import { FONT_SIZE, styles } from "./styles.ts";
import WeaponSets from "./WeaponSets.tsx";

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
  const combatData = CombatSheet.describe(combat);
  const saveData = saves.getSaves();
  const classData = classes.getCharacterClasses();
  return (
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{identityData.physiology.name}</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          {/* Its classes, in the web sheet's words: Personal Details gives its race */}
          <Text style={styles.subtitle}>
            {Object.values(classData)
              .map((cl) => ClassLevels.format(cl.klass.name, cl.levels.length))
              .join(ClassLevels.SEPARATOR)}
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
              <Text style={styles.headerValue}>{identityData.physiology.race?.fields[RACE_SIZE] || "Medium"}</Text>
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

      <View style={styles.twoColumn} wrap={false}>
        {/* Left Column */}
        <View style={styles.halfWidth}>
          {/* Ability Scores */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ability Scores</Text>
            <AbilityScores abilities={abilities.getAbilitiesWithIds()} />
          </View>
        </View>

        {/* Right Column */}
        <View style={styles.halfWidth}>
          {/* Saving Throws */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Saving Throws</Text>
            <View style={[styles.row, { justifyContent: "space-between" }]}>
              {Object.values(saveData).map((save) => (
                <View key={save.name} style={styles.saveBox}>
                  <Text style={styles.abilityName}>{save.name}</Text>
                  <Text style={styles.abilityMod}>{SheetFormat.formatModifier(save.total)}</Text>
                  <Text style={{ fontSize: FONT_SIZE.xs, color: "#666", marginTop: 2, textAlign: "center" }}>
                    {/* Each part's name and value kept together (no-break spaces), a part wrapping whole */}
                    {[
                      `Base\u00a0${SheetFormat.formatModifier(save.base)}`,
                      `Ability\u00a0${SheetFormat.formatModifier(save.ability)}`,
                      `Misc\u00a0${SheetFormat.formatModifier(save.misc)}`,
                    ].join(" | ")}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/*
          Combat: its stats, then each weapon set with its armor class and its attacks, as the web sheet shows them.
          Each set is kept whole, the first with the heading and the stats, and a set the page has no room left for goes
          to the next
        */}
      <View style={styles.section}>
        <WeaponSets combat={combatData}>
          <Text style={styles.sectionTitle}>Combat</Text>
          <View style={[styles.row, { flexWrap: "wrap", justifyContent: "space-between", marginBottom: 6 }]}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>HP</Text>
              <Text style={styles.statValue}>{combatData.hp.total}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Initiative</Text>
              <Text style={styles.statValue}>{SheetFormat.formatModifier(combatData.initiative.total)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Speed</Text>
              <Text style={styles.statValue}>{combatData.speedLabel}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>BAB</Text>
              <Text style={styles.statValue}>{combatData.babLabel}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Grapple</Text>
              <Text style={styles.statValue}>{SheetFormat.formatModifier(combatData.grapple.total)}</Text>
            </View>
          </View>
        </WeaponSets>
      </View>
    </Page>
  );
}

export default InfoPage;
