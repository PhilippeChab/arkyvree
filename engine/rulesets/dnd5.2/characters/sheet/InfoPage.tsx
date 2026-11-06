import { Image, Page, Text, View } from "@react-pdf/renderer";

import type { SheetField } from "@/engine/core/module/index.ts";
import type CharacterResponse from "@/engine/rulesets/dnd5.2/characters/description/CharacterResponse.ts";
import SheetBlocks from "@/engine/rulesets/dnd5.2/characters/description/SheetBlocks.ts";
import IdentityFields from "@/engine/rulesets/dnd5.2/characters/IdentityFields.ts";
import AbilityRules from "@/engine/rulesets/dnd5.2/rules/AbilityRules.ts";
import { CHARACTER_FIELDS, SPECIES_SIZE } from "@/vocabulary/dnd5.2/fields/index.ts";

import AbilityScores from "./AbilityScores.tsx";
import SheetFormat from "./SheetFormat.ts";
import { FONT_SIZE, styles } from "./styles.ts";
import WeaponSets from "./WeaponSets.tsx";

/** A line of the personal details: its label and its value. */
interface Detail {
  label: string;
  value: string;
}

/**
 * The identity block's fields the personal details' first column prints, by their keys: its experience, species,
 * background, age and deity.
 */
const FIRST_DETAILS = [
  CHARACTER_FIELDS.xp.field,
  IdentityFields.SPECIES_KEY,
  IdentityFields.BACKGROUND_KEY,
  CHARACTER_FIELDS.age.field,
  CHARACTER_FIELDS.deity.field,
];

/** A field as the personal details print it: its label and its value, a dash for none. */
function detailOf(field: SheetField): Detail {
  const { value } = field;
  return { label: field.label, value: value === null || value === "" ? "—" : String(value) };
}

/** A column of the personal details: a line each, its label and its value. */
function DetailsColumn({ details }: { details: Detail[] }) {
  return (
    <View style={{ width: "22%" }}>
      {details.map(({ label, value }) => (
        <View key={label} style={styles.headerRow}>
          <Text style={styles.headerLabel}>{`${label}:`}</Text>
          <Text style={styles.headerValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The sheet's first page, from its sheet (`sheet`, as the API describes it): who the character is (its identity's block,
 * its size beside it), its ability scores, saving throws and combat, each its block, under its name, its classes (its
 * summary's) and its ruleset's name (`rulesetName`).
 */
function InfoPage({
  portraitUrl,
  rulesetName,
  sheet,
}: {
  portraitUrl?: string | null;
  rulesetName?: string;
  sheet: ReturnType<typeof CharacterResponse.buildSheet>;
}) {
  const { blocks, summary } = sheet;
  const identity = SheetBlocks.blockOf(blocks, "fields", "identity");
  const saves = SheetBlocks.blockOf(blocks, "scores", "saves");
  const combat = SheetBlocks.blockOf(blocks, "stats", "combat");
  const detailsOf = (keys: string[]) => keys.map((key) => detailOf(SheetBlocks.fieldOf(identity, key)));
  // Its alignment and gender, its species' size, its height and its weight
  const second = [
    ...detailsOf([CHARACTER_FIELDS.alignment.field, CHARACTER_FIELDS.gender.field]),
    { label: "Size", value: String(sheet.identity.physiology.species.fields[SPECIES_SIZE]) },
    ...detailsOf([CHARACTER_FIELDS.height.field, CHARACTER_FIELDS.weight.field]),
  ];
  const description = SheetBlocks.fieldOf(identity, IdentityFields.DESCRIPTION_KEY);
  // The abilities other than the books', whose box names them under their abbreviation
  const named = new Set(
    sheet.abilities.filter((ability) => !AbilityRules.isBookAbility(ability.key)).map(({ abilityId }) => abilityId),
  );
  return (
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{sheet.identity.physiology.name}</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          {/* Its classes, as the web sheet's header names them: Personal Details gives its species */}
          <Text style={styles.subtitle}>{summary.tracks.map(({ label }) => label).join(summary.separator)}</Text>
          <Text style={styles.subtitle}>{rulesetName ?? ""}</Text>
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
          <DetailsColumn details={detailsOf(FIRST_DETAILS)} />
          <DetailsColumn details={second} />
        </View>
        {identity.links
          ?.filter(({ picked }) => picked.length > 0)
          .map(({ label, picked, role }) => (
            <Text key={role} style={[styles.headerValue, { marginTop: 6 }]}>
              <Text style={styles.headerLabel}>{`${label}: `}</Text>
              {picked.map(({ name }) => name).join(", ")}
            </Text>
          ))}
        <View style={{ marginTop: 6 }}>
          <View style={styles.headerRow}>
            <Text style={styles.headerLabel}>{`${description.label}:`}</Text>
          </View>
          {description.value ? (
            <Text style={{ fontSize: FONT_SIZE.md, marginTop: 2, lineHeight: 1.4 }}>{description.value}</Text>
          ) : (
            <Text style={{ fontSize: FONT_SIZE.md, fontStyle: "italic", color: "#888" }}>—</Text>
          )}
        </View>
        <View style={{ marginTop: 6 }}>
          <View style={styles.headerRow}>
            <Text style={styles.headerLabel}>Notes:</Text>
          </View>
          {identity.notes?.notes ? (
            <Text style={{ fontSize: FONT_SIZE.md, marginTop: 2, lineHeight: 1.4 }}>{identity.notes.notes}</Text>
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
            <AbilityScores block={SheetBlocks.blockOf(blocks, "scores", "abilities")} named={named} />
          </View>
        </View>

        {/* Right Column */}
        <View style={styles.halfWidth}>
          {/* Saving Throws */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Saving Throws</Text>
            {/* Six saving throws, three a line */}
            <View style={[styles.row, { flexWrap: "wrap", justifyContent: "space-between", rowGap: 4 }]}>
              {saves.scores.map((save) => (
                <View key={save.key} style={[styles.saveBox, { width: "32%" }]}>
                  <Text style={styles.abilityName}>{save.label}</Text>
                  <Text style={styles.abilityMod}>{SheetFormat.valueOf(save)}</Text>
                  <Text style={{ fontSize: FONT_SIZE.xs, color: "#666", marginTop: 2, textAlign: "center" }}>
                    {/* Each part's name and value kept together (no-break spaces), a part wrapping whole */}
                    {save.parts.map(({ label, value }) => `${label} ${value}`).join(" | ")}
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
        <WeaponSets combat={combat}>
          <Text style={styles.sectionTitle}>Combat</Text>
          <View style={[styles.row, { flexWrap: "wrap", justifyContent: "space-between", marginBottom: 6 }]}>
            {combat.stats.map(({ label, value }) => (
              <View key={label} style={styles.statBox}>
                <Text style={styles.statLabel}>{label}</Text>
                <Text style={styles.statValue}>{value}</Text>
              </View>
            ))}
          </View>
        </WeaponSets>
      </View>
    </Page>
  );
}

export default InfoPage;
