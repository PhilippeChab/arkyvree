import type { LevelUpSkillsStepProps } from "./levelUpFactory.ts";
import { computeMaxPointsForSkill, distributeSkillPoints } from "@/shared/dnd3.5/skills.ts";
import ExpandLess from "@mui/icons-material/ExpandLess";
import { Casino as CasinoIcon } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { DiceSpinner } from "@/client/src/components/common/index.ts";
import { memo, useCallback, useMemo, useRef, useState } from "react";

interface SkillDef {
  id: string;
  name: string;
  description?: string | null;
  isClassSkill: boolean;
  isCurrentClassSkill: boolean;
  currentRank: number;
}

interface SkillRowProps {
  skill: SkillDef;
  totalCharacterLevel: number;
  pointsAllocated: number;
  onAllocate: (skillId: string, rawPoints: number) => void;
  indented?: boolean;
  hidden?: boolean;
  perLevelClassSkillIds?: string[][];
  perLevelSkillPoints?: number[];
}

function getSkillGroup(name: string): string | null {
  const match = name.match(/^(.+?)\s*\(/);
  return match ? match[1] : null;
}

const SkillRow = memo(function SkillRow({
  skill,
  totalCharacterLevel,
  pointsAllocated,
  onAllocate,
  indented,
  hidden,
  perLevelClassSkillIds,
  perLevelSkillPoints,
}: SkillRowProps) {
  const isMultiLevel = perLevelClassSkillIds && perLevelSkillPoints;
  // Multi-level batches of the same class should still display per-class
  // class-skill status (not the character-wide history captured by
  // `skill.isClassSkill`). Only widen to the history view when the batch
  // actually spans multiple distinct classes.
  const isMultiClass = isMultiLevel &&
    perLevelClassSkillIds.some((ids) => ids.join(",") !== perLevelClassSkillIds[0].join(","));

  // If class skill for any planned level, distributeSkillPoints always puts the
  // first point into a class-skill level (1 pt = 1 rank), so step must be 1.
  // Step 0.5 only works for purely cross-class skills (all levels are cross-class).
  const isClassForAnyLevel = isMultiLevel &&
    perLevelClassSkillIds.some((ids) => ids.includes(skill.id));

  const ranksGained = isMultiLevel
    ? distributeSkillPoints(skill.id, pointsAllocated, perLevelClassSkillIds, perLevelSkillPoints).ranks
    : skill.isCurrentClassSkill ? pointsAllocated : pointsAllocated * 0.5;

  const maxRank = skill.isClassSkill
    ? (totalCharacterLevel + 3)
    : (totalCharacterLevel + 3) / 2;
  const maxRanksCanAdd = maxRank - skill.currentRank;

  const maxFromLevel = isMultiLevel
    ? computeMaxPointsForSkill(skill.id, maxRanksCanAdd, perLevelClassSkillIds, perLevelSkillPoints)
    : skill.isCurrentClassSkill
      ? maxRanksCanAdd
      : maxRanksCanAdd * 2;

  const displayName = indented ? skill.name.replace(/^.+?\s*\(/, "(") : skill.name;

  return (
    <TableRow
      sx={{
        ...(hidden && { display: "none" }),
        ...(!hidden && indented ? {
          animation: "fadeInRow 200ms ease-out",
          "@keyframes fadeInRow": {
            from: { opacity: 0 },
            to: { opacity: 1 },
          },
        } : {}),
      }}
    >
      <TableCell sx={indented ? { pl: 5 } : undefined}>
        {skill.description ? (
          <Tooltip title={skill.description} enterTouchDelay={0} arrow>
            <span
              style={{
                borderBottom: "1px dashed currentColor",
                cursor: "help",
              }}
            >
              {displayName}
            </span>
          </Tooltip>
        ) : (
          displayName
        )}
      </TableCell>
      <TableCell>
        <TextField
          type="number"
          size="small"
          sx={{ width: { xs: "60px", sm: "70px" } }}
          value={ranksGained || ""}
          onChange={(e) => {
            const ranksValue = parseFloat(e.target.value) || 0;
            // For multi-level plans, we need to reverse-compute points from desired ranks.
            // For simplicity, increment/decrement by finding the points that produce the closest rank.
            if (isMultiLevel) {
              // Binary search for the right point count that produces this rank value
              let lo = 0, hi = maxFromLevel;
              while (lo < hi) {
                const mid = Math.ceil((lo + hi) / 2);
                const r = distributeSkillPoints(skill.id, mid, perLevelClassSkillIds, perLevelSkillPoints).ranks;
                if (r <= ranksValue) lo = mid; else hi = mid - 1;
              }
              onAllocate(skill.id, lo);
            } else {
              const pointsValue = skill.isCurrentClassSkill ? ranksValue : ranksValue * 2;
              const pointsInt = Math.round(pointsValue);
              onAllocate(skill.id, Math.min(pointsInt, maxFromLevel));
            }
          }}
          slotProps={{
            htmlInput: {
              min: 0,
              max: maxRanksCanAdd,
              step: isMultiLevel ? (isClassForAnyLevel ? 1 : 0.5) : skill.isCurrentClassSkill ? 1 : 0.5,
            }
          }}
        />
      </TableCell>
      <TableCell>
        <Typography variant="body2" color="textSecondary">
          {pointsAllocated}
        </Typography>
      </TableCell>
      <TableCell>{skill.currentRank}</TableCell>
      <TableCell>
        <Typography variant="body2" sx={{ fontWeight: ranksGained > 0 ? 600 : 400, color: ranksGained > 0 ? "primary.main" : "text.secondary" }}>
          {skill.currentRank + ranksGained}
        </Typography>
      </TableCell>
      <TableCell>{isMultiClass ? (skill.isClassSkill ? "Yes" : "No") : skill.isCurrentClassSkill ? "Yes" : "No"}</TableCell>
    </TableRow>
  );
});

type Row =
  | { type: "skill"; skill: SkillDef; group: null }
  | { type: "skill"; skill: SkillDef; group: string }
  | { type: "group"; prefix: string; count: number };

export function LevelUpSkillsStep({
  skillData,
  isLoadingSkills,
  skillsError,
  skillPointAllocations,
  setValue,
  perLevelClassSkillIds,
  perLevelSkillPoints,
}: LevelUpSkillsStepProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const allocationsRef = useRef(skillPointAllocations);
  allocationsRef.current = skillPointAllocations;

  const randomAssign = useCallback(() => {
    if (!skillData) return;
    const isMultiLevel = perLevelClassSkillIds && perLevelSkillPoints;

    const skillMaxes = skillData.skills
      .map((skill) => {
        const maxRank = skill.isClassSkill
          ? skillData.totalCharacterLevel + 3
          : (skillData.totalCharacterLevel + 3) / 2;
        const maxRanksCanAdd = maxRank - skill.currentRank;
        const maxFromLevel = isMultiLevel
          ? computeMaxPointsForSkill(skill.id, maxRanksCanAdd, perLevelClassSkillIds, perLevelSkillPoints)
          : skill.isCurrentClassSkill
            ? maxRanksCanAdd
            : maxRanksCanAdd * 2;
        return { id: skill.id, max: maxFromLevel };
      })
      .filter((s) => s.max > 0);

    const allocations: Record<string, number> = {};
    let remaining = skillData.skillPointsToSpend;

    while (remaining > 0) {
      const available = skillMaxes.filter((s) => (allocations[s.id] ?? 0) < s.max);
      if (available.length === 0) break;
      const pick = available[Math.floor(Math.random() * available.length)];
      allocations[pick.id] = (allocations[pick.id] ?? 0) + 1;
      remaining--;
    }

    setValue("skillPointAllocations", allocations);
  }, [skillData, perLevelClassSkillIds, perLevelSkillPoints, setValue]);

  const skillPointsToSpend = skillData?.skillPointsToSpend ?? 0;

  const onAllocate = useCallback((skillId: string, rawPoints: number) => {
    if (!skillPointsToSpend) return;
    const allocs = allocationsRef.current;
    const currentTotal = Object.entries(allocs)
      .filter(([id]) => id !== skillId)
      .reduce((sum, [, points]) => sum + points, 0);
    const maxFromAvailable = skillPointsToSpend - currentTotal;
    const clamped = Math.max(0, Math.min(rawPoints, maxFromAvailable));
    setValue("skillPointAllocations", { ...allocs, [skillId]: clamped });
  }, [skillPointsToSpend, setValue]);

  const rows = useMemo(() => {
    if (!skillData) return [];
    const skills = skillData.skills;

    const prefixCounts = new Map<string, number>();
    for (const skill of skills) {
      const prefix = getSkillGroup(skill.name);
      if (prefix) prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
    }

    const result: Row[] = [];
    let lastPrefix: string | null = null;

    for (const skill of skills) {
      const prefix = getSkillGroup(skill.name);
      const isGrouped = prefix !== null && (prefixCounts.get(prefix) ?? 0) >= 2;

      if (isGrouped && prefix !== lastPrefix) {
        result.push({ type: "group", prefix: prefix!, count: prefixCounts.get(prefix!)! });
        lastPrefix = prefix;
      }

      result.push({ type: "skill", skill, group: isGrouped ? prefix : null });
    }

    return result;
  }, [skillData]);

  const toggle = (prefix: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) { next.delete(prefix); } else { next.add(prefix); }
      return next;
    });
  };

  if (isLoadingSkills) return <DiceSpinner />;
  if (skillsError) return <Alert severity="error">Error loading skills.</Alert>;
  if (!skillData) return null;

  const pointsSpent = Object.values(skillPointAllocations).reduce((sum, points) => sum + points, 0);
  const pointsRemaining = skillData.skillPointsToSpend - pointsSpent;

  return (
    <Box>
      <Box sx={{ position: "sticky", top: 0, zIndex: 1, bgcolor: "background.paper", pb: 1 }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: "center",
            mb: 1
          }}>
          <Typography variant="h6">
            Skill Points to Spend: {skillData.skillPointsToSpend}
          </Typography>
          <Button startIcon={<CasinoIcon />} onClick={randomAssign} size="small">
            Auto
          </Button>
        </Stack>
        <Typography
          variant="subtitle2"
          gutterBottom
          color={pointsSpent > skillData.skillPointsToSpend
            ? "error"
            : pointsSpent === skillData.skillPointsToSpend
            ? "success"
            : "textSecondary"}
        >
          Points Spent: {pointsSpent} / {skillData.skillPointsToSpend}
          {pointsRemaining > 0 && (
            <span style={{ color: "#ff9800", marginLeft: "8px" }}>
              ({pointsRemaining} remaining)
            </span>
          )}
        </Typography>
      </Box>
      <TableContainer sx={{ overflowX: "auto", mx: { xs: -2, sm: 0 }, width: { xs: "calc(100% + 32px)", sm: "100%" } }}>
        <Table size="small" sx={{ minWidth: 420, tableLayout: "fixed" }}>
          <colgroup>
            <col />
            <col style={{ width: 80 }} />
            <col style={{ width: 55 }} />
            <col style={{ width: 55 }} />
            <col style={{ width: 55 }} />
            <col style={{ width: 55 }} />
          </colgroup>
          <TableHead>
            <TableRow>
              <TableCell>Skill</TableCell>
              <TableCell sx={{ whiteSpace: "nowrap", fontSize: { xs: "0.7rem", sm: "0.8125rem" } }}>Add</TableCell>
              <TableCell sx={{ whiteSpace: "nowrap", fontSize: { xs: "0.7rem", sm: "0.8125rem" } }}>Used</TableCell>
              <TableCell sx={{ whiteSpace: "nowrap", fontSize: { xs: "0.7rem", sm: "0.8125rem" } }}>Rank</TableCell>
              <TableCell sx={{ whiteSpace: "nowrap", fontSize: { xs: "0.7rem", sm: "0.8125rem" } }}>Total</TableCell>
              <TableCell sx={{ whiteSpace: "nowrap", fontSize: { xs: "0.7rem", sm: "0.8125rem" } }}>Class</TableCell>
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
                <SkillRow
                  key={skill.id}
                  skill={skill}
                  totalCharacterLevel={skillData.totalCharacterLevel}
                  pointsAllocated={skillPointAllocations[skill.id] || 0}
                  onAllocate={onAllocate}
                  indented={!!group}
                  hidden={hidden}
                  perLevelClassSkillIds={perLevelClassSkillIds}
                  perLevelSkillPoints={perLevelSkillPoints}
                />
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
