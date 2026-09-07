import type { SkillsSectionProps } from "../../sectionFactory.ts";
import { BlankState } from "@/client/src/components/common/index.ts";
import ExpandLess from "@mui/icons-material/ExpandLess";
import {
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";

function getSkillGroup(name: string): string | null {
  const match = name.match(/^(.+?)\s*\(/);
  return match ? match[1] : null;
}

type Skill = SkillsSectionProps["skills"][string];

function formatValue(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

type Row =
  | { type: "skill"; skill: Skill; group: null }
  | { type: "skill"; skill: Skill; group: string }
  | { type: "group"; prefix: string; count: number };

export function SkillsSection({ skills }: SkillsSectionProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const rows = useMemo(() => {
    const sorted = Object.values(skills).sort((a, b) => a.name.localeCompare(b.name));

    const prefixCounts = new Map<string, number>();
    for (const skill of sorted) {
      const prefix = getSkillGroup(skill.name);
      if (prefix) prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
    }

    const result: Row[] = [];
    let lastPrefix: string | null = null;

    for (const skill of sorted) {
      const prefix = getSkillGroup(skill.name);
      const isGrouped = prefix !== null && (prefixCounts.get(prefix) ?? 0) >= 2;

      if (isGrouped && prefix !== lastPrefix) {
        result.push({ type: "group", prefix: prefix!, count: prefixCounts.get(prefix!)! });
        lastPrefix = prefix;
      }

      result.push({ type: "skill", skill, group: isGrouped ? prefix : null });
    }

    return result;
  }, [skills]);

  const toggle = (prefix: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) { next.delete(prefix); } else { next.add(prefix); }
      return next;
    });
  };

  const hasSkills = skills && typeof skills === "object" && Object.keys(skills).length > 0;

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography sx={{ fontWeight: 600, color: "primary.main", mb: 3, typography: { xs: "h6", sm: "h5" } }}>
        Skills
      </Typography>
      {hasSkills
        ? (
          <>
            <Typography variant="body2" sx={{ mb: 2, color: "text.secondary", fontStyle: "italic" }}>
              * indicates a class skill
            </Typography>
            <TableContainer sx={{ overflowX: "auto", mx: { xs: -2, sm: 0 }, width: { xs: "calc(100% + 32px)", sm: "100%" } }}>
              <Table size="small" sx={{ minWidth: 400, tableLayout: "fixed" }}>
                <colgroup>
                  <col />
                  <col style={{ width: 50 }} />
                  <col style={{ width: 50 }} />
                  <col style={{ width: 50 }} />
                  <col style={{ width: 50 }} />
                  <col style={{ width: 50 }} />
                </colgroup>
                <TableHead>
                  <TableRow sx={{ bgcolor: "grey.100" }}>
                    <TableCell sx={{ fontWeight: 600 }}>Skill</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600, fontSize: { xs: "0.7rem", sm: "0.8125rem" } }}>Rank</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600, fontSize: { xs: "0.7rem", sm: "0.8125rem" } }}>Abil</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600, fontSize: { xs: "0.7rem", sm: "0.8125rem" } }}>Misc</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600, fontSize: { xs: "0.7rem", sm: "0.8125rem" } }}>Wt</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600, fontSize: { xs: "0.7rem", sm: "0.8125rem" } }}>Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => {
                    if (row.type === "group") {
                      const isExpanded = expanded.has(row.prefix);
                      return (
                        <TableRow
                          key={`group-${row.prefix}`}
                          sx={{ bgcolor: "action.hover", cursor: "pointer" }}
                          onClick={() => toggle(row.prefix)}
                        >
                          <TableCell sx={{ fontWeight: 600 }}>
                            {row.prefix} ({row.count})
                          </TableCell>
                          <TableCell colSpan={4} />
                          <TableCell align="center">
                            <IconButton size="small" sx={{ transition: "transform 200ms", transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)" }}>
                              <ExpandLess fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    }

                    const { skill, group } = row;
                    const hidden = !!group && !expanded.has(group);
                    return (
                      <TableRow
                        key={skill.name}
                        sx={{
                          ...(hidden && { display: "none" }),
                          ...(!hidden && group ? {
                            animation: "fadeInRow 200ms ease-out",
                            "@keyframes fadeInRow": {
                              from: { opacity: 0 },
                              to: { opacity: 1 },
                            },
                          } : {}),
                        }}
                      >
                        <TableCell sx={group ? { pl: 5 } : undefined}>
                          {group ? skill.name.replace(/^.+?\s*\(/, "(") : skill.name}
                          {skill.innate ? " *" : ""}
                        </TableCell>
                        <TableCell align="center">{skill.rank || 0}</TableCell>
                        <TableCell align="center">{formatValue(skill.ability)}</TableCell>
                        <TableCell align="center">
                          {skill.misc !== 0 ? formatValue(skill.misc) : "—"}
                        </TableCell>
                        <TableCell align="center">
                          {skill.weight ? `-${skill.weight}` : "—"}
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 600 }}>
                          {formatValue(skill.total)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )
        : <BlankState title="No skills available" />}
    </Paper>
  );
}
