import { Stack, Typography } from "@mui/material";

import { GroupedSkillRows, SkillRow } from "@/client/src/components/characters/sections/GroupedSkillRows.tsx";
import { SheetSection } from "@/client/src/components/characters/sections/SheetSection.tsx";
import { BlankNote, DataCell, DataTable, EmptyValue, type TableColumn } from "@/client/src/components/common/index.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { formatSigned } from "@/shared/text.ts";

interface SkillsSectionProps {
  skills: NonNullable<CharacterDetail["skills"]>;
}

/** The number columns' headers, smaller, and their cells closer to their figures */
const NARROW_HEADERS_SX = {
  "& > thead th:not(:first-of-type)": { fontSize: "0.8125rem" },
  "& th:not(:first-of-type), & td:not(:first-of-type)": { px: { sm: 1 } },
};

/** A skill's columns: on a phone, its name leads, its total at the line's end, and its parts under them, named */
const SKILL_COLUMNS: TableColumn[] = [
  { key: "skill", label: "Skill" },
  { key: "rank", label: "Rank", width: "56px", align: "center" },
  { key: "ability", label: "Ability", width: "64px", align: "center" },
  { key: "misc", label: "Misc. Bonus", width: "96px", align: "center" },
  { key: "weight", label: "Armor Check", width: "104px", align: "center" },
  { key: "total", label: "Total", width: "56px", align: "center" },
];

export function SkillsSection({ skills }: SkillsSectionProps) {
  const sortedSkills = Object.values(skills).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <SheetSection title="Skills">
      {sortedSkills.length > 0 ? (
        <Stack spacing={2}>
          <Typography variant="body2" sx={{ color: "text.secondary", fontStyle: "italic" }}>
            * indicates a class skill
          </Typography>
          <DataTable size="small" columns={SKILL_COLUMNS} minWidth={520} fixed sx={NARROW_HEADERS_SX}>
            <GroupedSkillRows
              skills={sortedSkills}
              columns={SKILL_COLUMNS.length}
              renderSkill={(skill, placement) => (
                <SkillRow
                  key={skill.name}
                  name={skill.name}
                  shortName={skill.shortName}
                  {...placement}
                  renderName={(label) => `${label}${skill.innate ? " *" : ""}`}
                >
                  <DataCell slot="labeled" label="Rank" align="center">
                    {skill.rank || 0}
                  </DataCell>
                  <DataCell slot="labeled" label="Ability" align="center">
                    {formatSigned(skill.ability)}
                  </DataCell>
                  <DataCell slot={skill.misc !== 0 ? "labeled" : "hidden"} label="Misc. Bonus" align="center">
                    {skill.misc !== 0 ? formatSigned(skill.misc) : <EmptyValue />}
                  </DataCell>
                  <DataCell slot={skill.weight ? "labeled" : "hidden"} label="Armor Check" align="center">
                    {skill.weight ? `-${skill.weight}` : <EmptyValue />}
                  </DataCell>
                  <DataCell slot="trailing" align="center" sx={{ fontWeight: 600 }}>
                    {formatSigned(skill.total)}
                  </DataCell>
                </SkillRow>
              )}
            />
          </DataTable>
        </Stack>
      ) : (
        <BlankNote>No skills</BlankNote>
      )}
    </SheetSection>
  );
}
