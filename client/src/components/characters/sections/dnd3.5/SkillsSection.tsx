import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useMemo } from "react";

import { SheetSection } from "@/client/src/components/characters/sections/SheetSection.tsx";
import { BlankNote } from "@/client/src/components/common/index.ts";
import { formatSigned } from "@/client/src/lib/formatNumeric.ts";

import { GroupedSkillRows, SkillRow } from "./GroupedSkillRows.tsx";
import type { Dnd35SkillsSectionProps } from "./types.ts";

/** The narrow number columns' headers. */
const COLUMN_HEADER_SX = { fontSize: { xs: "0.7rem", sm: "0.8125rem" } };

export function SkillsSection({ skills }: Dnd35SkillsSectionProps) {
  const sortedSkills = useMemo(() => Object.values(skills).sort((a, b) => a.name.localeCompare(b.name)), [skills]);

  return (
    <SheetSection title="Skills">
      {sortedSkills.length > 0 ? (
        <Stack spacing={2}>
          <Typography variant="body2" sx={{ color: "text.secondary", fontStyle: "italic" }}>
            * indicates a class skill
          </Typography>
          <TableContainer
            sx={{ overflowX: "auto", mx: { xs: -2, sm: 0 }, width: { xs: "calc(100% + 32px)", sm: "100%" } }}
          >
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
                  <TableCell align="center" sx={COLUMN_HEADER_SX}>
                    Rank
                  </TableCell>
                  <TableCell align="center" sx={COLUMN_HEADER_SX}>
                    Abil
                  </TableCell>
                  <TableCell align="center" sx={COLUMN_HEADER_SX}>
                    Misc
                  </TableCell>
                  <TableCell align="center" sx={COLUMN_HEADER_SX}>
                    Wt
                  </TableCell>
                  <TableCell align="center" sx={COLUMN_HEADER_SX}>
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
                      <TableCell align="center" sx={{ fontWeight: 600 }}>
                        {formatSigned(skill.total)}
                      </TableCell>
                    </SkillRow>
                  )}
                />
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      ) : (
        <BlankNote>No skills available</BlankNote>
      )}
    </SheetSection>
  );
}
