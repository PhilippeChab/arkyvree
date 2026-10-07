import { Page, Text, View } from "@react-pdf/renderer";

import { type Dnd35DetailedCharacter } from "@/server/rulesets/dnd3.5/index.ts";

import ContinuationHeader from "./ContinuationHeader.tsx";
import { formatModifier } from "./format.ts";
import { FONT_SIZE, styles } from "./styles.ts";

function SkillsPage({ detailedCharacter }: { detailedCharacter: Dnd35DetailedCharacter }) {
  const identity = detailedCharacter.components.identity;
  const skills = detailedCharacter.components.skills;
  const identityData = identity.getIdentity();
  return (
    <Page size="A4" style={styles.page}>
      <ContinuationHeader name={identityData.physiology.name} />

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
            <Text style={{ fontSize: FONT_SIZE.sm, color: "#666", fontStyle: "italic" }}>* = Class Skill</Text>
            <Text style={{ fontSize: FONT_SIZE.sm, color: "#333" }}>
              Skill Points: {detailedCharacter.components.skills.getSkillBudget().spent || 0} /{" "}
              {detailedCharacter.components.skills.getSkillBudget().total || 0}
            </Text>
          </View>
        </View>

        {(() => {
          const skillsData = skills.getSkills();
          const skillEntries = Object.values(skillsData);

          if (!skillEntries || skillEntries.length === 0)
            return <Text style={styles.emptyMessage}>No skills available</Text>;

          const sorted = [...skillEntries].sort((a, b) => a.name.localeCompare(b.name));
          const half = Math.ceil(sorted.length / 2);
          const columns = [sorted.slice(0, half), sorted.slice(half)];

          const renderHeader = () => (
            <View style={styles.skillsHeader}>
              <Text style={[styles.skillHeaderText, { width: "40%" }]}>SKILL</Text>
              <Text style={[styles.skillHeaderText, { width: "12%", textAlign: "center" }]}>RANK</Text>
              <Text style={[styles.skillHeaderText, { width: "12%", textAlign: "center" }]}>MOD</Text>
              <Text style={[styles.skillHeaderText, { width: "12%", textAlign: "center" }]}>MISC</Text>
              <Text style={[styles.skillHeaderText, { width: "12%", textAlign: "center" }]}>WGT</Text>
              <Text style={[styles.skillHeaderText, { width: "12%", textAlign: "center" }]}>TOTAL</Text>
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
                        style={[
                          skill.trained ? styles.skillName : styles.skillNameUntrained,
                          {
                            width: "40%",
                          },
                        ]}
                      >
                        {skill.name}
                        {skill.innate ? "*" : ""}
                      </Text>
                      <Text style={skill.trained ? styles.skillRank : styles.skillRankUntrained}>{skill.rank}</Text>
                      <Text style={skill.trained ? styles.skillMod : styles.skillModUntrained}>
                        {formatModifier(skill.ability)}
                      </Text>
                      <Text style={skill.trained ? styles.skillOther : styles.skillOtherUntrained}>
                        {skill.misc !== 0 ? formatModifier(skill.misc) : "—"}
                      </Text>
                      <Text style={skill.trained ? styles.skillWeight : styles.skillWeightUntrained}>
                        {skill.weight ? `-${skill.weight}` : "—"}
                      </Text>
                      <Text style={skill.trained ? styles.skillBonus : styles.skillBonusUntrained}>
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
  );
}

export default SkillsPage;
