import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { useMemo } from "react";

import { BlankState, Section } from "@/client/src/components/common/index.ts";
import { formatSigned } from "@/client/src/lib/formatNumeric.ts";

import { GroupedSkillRows, SkillRow } from "./GroupedSkillRows.tsx";
import type { Dnd35SkillsSectionProps } from "./types.ts";

/** The narrow number columns' headers. */
const columnHeaderSx = { typography: { xs: "caption", sm: "body2" }, fontWeight: "fontWeightBold" };

export function SkillsSection({ skills }: Dnd35SkillsSectionProps) {
  const sortedSkills = useMemo(() => Object.values(skills).sort((a, b) => a.name.localeCompare(b.name)), [skills]);

  return (
    <Section title="Skills">
      {sortedSkills.length > 0 ? (
        <>
          <Typography variant="body2" sx={{ color: "text.secondary", fontStyle: "italic" }}>
            * indicates a class skill
          </Typography>
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table size="small" sx={{ minWidth: 400, tableLayout: "fixed" }}>
              <colgroup>
                <col />
                <Box component="col" sx={{ width: 50 }} />
                <Box component="col" sx={{ width: 50 }} />
                <Box component="col" sx={{ width: 50 }} />
                <Box component="col" sx={{ width: 50 }} />
                <Box component="col" sx={{ width: 50 }} />
              </colgroup>
              <TableHead>
                <TableRow>
                  <TableCell>Skill</TableCell>
                  <TableCell align="center" sx={columnHeaderSx}>
                    Rank
                  </TableCell>
                  <TableCell align="center" sx={columnHeaderSx}>
                    Abil
                  </TableCell>
                  <TableCell align="center" sx={columnHeaderSx}>
                    Misc
                  </TableCell>
                  <TableCell align="center" sx={columnHeaderSx}>
                    Wt
                  </TableCell>
                  <TableCell align="center" sx={columnHeaderSx}>
                    Total
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <GroupedSkillRows
                  skills={sortedSkills}
                  columns={6}
                  renderSkill={(skill, placement) => (
                    <SkillRow
                      key={skill.name}
                      name={skill.name}
                      {...placement}
                      renderName={(label) => `${label}${skill.innate ? " *" : ""}`}
                    >
                      <TableCell align="center">{skill.rank || 0}</TableCell>
                      <TableCell align="center">{formatSigned(skill.ability)}</TableCell>
                      <TableCell align="center">{skill.misc !== 0 ? formatSigned(skill.misc) : "—"}</TableCell>
                      <TableCell align="center">{skill.weight ? `-${skill.weight}` : "—"}</TableCell>
                      <TableCell align="center" sx={{ fontWeight: "fontWeightBold" }}>
                        {formatSigned(skill.total)}
                      </TableCell>
                    </SkillRow>
                  )}
                />
              </TableBody>
            </Table>
          </TableContainer>
        </>
      ) : (
        <BlankState title="No skills available" />
      )}
    </Section>
  );
}
