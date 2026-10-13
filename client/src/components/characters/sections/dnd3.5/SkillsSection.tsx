import { Stack, Typography } from "@mui/material";

import { SheetSection } from "@/client/src/components/characters/sections/SheetSection.tsx";
import { BlankNote, DataCell, DataTable, EmptyValue, type TableColumn } from "@/client/src/components/common/index.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { formatSigned } from "@/shared/text.ts";

import { GroupedSkillRows, SkillRow } from "./GroupedSkillRows.tsx";

interface SkillsSectionProps {
  skills: NonNullable<CharacterDetail["skills"]>;
}

/** The narrow number columns' headers, smaller */
const NARROW_HEADERS_SX = { "& > thead th:not(:first-of-type)": { fontSize: "0.8125rem" } };

/** A skill's columns: on a phone, its name leads, its total at the line's end, and its parts under them, named */
const SKILL_COLUMNS: TableColumn[] = [
  { key: "skill", label: "Skill" },
  { key: "rank", label: "Rank", width: "50px", align: "center" },
  { key: "ability", label: "Abil", width: "50px", align: "center" },
  { key: "misc", label: "Misc", width: "50px", align: "center" },
  { key: "weight", label: "Wt", width: "50px", align: "center" },
  { key: "total", label: "Total", width: "50px", align: "center" },
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
          <DataTable size="small" columns={SKILL_COLUMNS} minWidth={400} fixed sx={NARROW_HEADERS_SX}>
            <GroupedSkillRows
              skills={sortedSkills}
              columns={SKILL_COLUMNS.length}
              renderSkill={(skill, placement) => (
                <SkillRow
                  key={skill.name}
                  name={skill.name}
                  {...placement}
                  renderName={(label) => `${label}${skill.innate ? " *" : ""}`}
                >
                  <DataCell slot="labeled" label="Rank" align="center">
                    {skill.rank || 0}
                  </DataCell>
                  <DataCell slot="labeled" label="Abil" align="center">
                    {formatSigned(skill.ability)}
                  </DataCell>
                  <DataCell slot={skill.misc !== 0 ? "labeled" : "hidden"} label="Misc" align="center">
                    {skill.misc !== 0 ? formatSigned(skill.misc) : <EmptyValue />}
                  </DataCell>
                  <DataCell slot={skill.weight ? "labeled" : "hidden"} label="Wt" align="center">
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
