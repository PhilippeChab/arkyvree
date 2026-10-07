import {
  Box,
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { memo, useCallback } from "react";
import { type Control, useController } from "react-hook-form";

import { GroupedSkillRows, SkillRow } from "@/client/src/components/characters/sections/dnd3.5/index.ts";
import { DiceSpinner, LoadError, SubsectionTitle } from "@/client/src/components/common/index.ts";
import { CasinoIcon } from "@/client/src/components/icons/index.ts";
import { useLatest } from "@/client/src/hooks/index.ts";
import { computeMaxSkillRank } from "@/shared/dnd3.5/skills.ts";

import {
  type LevelUpFormData,
  maxSkillPoints,
  type SkillLevels,
  skillRanks,
  type SkillsData,
} from "./levelUp/index.ts";
import { OptionTooltip } from "./OptionTooltip.tsx";

interface SkillAllocationRowProps {
  hidden: boolean;
  indented: boolean;
  levels: SkillLevels;
  onAllocate: (skillId: string, rawPoints: number) => void;
  pointsAllocated: number;
  skill: SkillsData["skills"][number];
  totalCharacterLevel: number;
}

/** The skill points state a level wizard hands the Skills step. */
interface SkillPickerState {
  /** The picks' form: the skill points field, which the step changes from `skillPointAllocations`. */
  control: Control<LevelUpFormData>;
  isLoadingSkills: boolean;
  skillData: SkillsData | null | undefined;
  /** The levels the points go to: the planned ones (Add Level), or the edited one. */
  skillLevels: SkillLevels | undefined;
  /** The points as they fit the slots */
  skillPointAllocations: Record<string, number>;
  skillsError: Error | null;
}

export interface SkillsStepProps {
  wizard: SkillPickerState;
}

/** The narrow number columns' headers. */
const COLUMN_HEADER_SX = { whiteSpace: "nowrap", fontSize: { xs: "0.7rem", sm: "0.8125rem" } };

const SkillAllocationRow = memo(function SkillAllocationRow({
  skill,
  totalCharacterLevel,
  pointsAllocated,
  onAllocate,
  indented,
  hidden,
  levels,
}: SkillAllocationRowProps) {
  // Levels of one class show its class skills (not the character-wide history captured by `skill.isClassSkill`);
  // only levels of several classes widen to the history.
  const isMultiClass = levels.classSkillIds.some((ids) => ids.join(",") !== levels.classSkillIds[0].join(","));

  // A class skill at any of the levels takes its first point there (a point a rank), so the step must be 1; 0.5 only
  // works for a skill cross-class at every level.
  const isClassForAnyLevel = levels.classSkillIds.some((ids) => ids.includes(skill.id));

  const ranksGained = skillRanks(skill.id, pointsAllocated, levels);
  const maxRanksCanAdd = computeMaxSkillRank(totalCharacterLevel, skill.isClassSkill) - skill.currentRank;
  const maxFromLevel = maxSkillPoints(skill, totalCharacterLevel, levels);

  return (
    <SkillRow
      name={skill.name}
      indented={indented}
      hidden={hidden}
      renderName={(label) =>
        skill.description ? (
          <OptionTooltip description={skill.description}>
            <Box component="span" sx={{ borderBottom: 1, borderBottomStyle: "dashed", cursor: "help" }}>
              {label}
            </Box>
          </OptionTooltip>
        ) : (
          label
        )
      }
    >
      <TableCell>
        <TextField
          type="number"
          size="small"
          sx={{ width: { xs: "60px", sm: "70px" } }}
          value={ranksGained || ""}
          onChange={(e) => {
            const ranksValue = parseFloat(e.target.value) || 0;
            // The most points whose ranks don't pass the ranks typed, found by a binary search
            let lo = 0,
              hi = maxFromLevel;
            while (lo < hi) {
              const mid = Math.ceil((lo + hi) / 2);
              if (skillRanks(skill.id, mid, levels) <= ranksValue) lo = mid;
              else hi = mid - 1;
            }
            onAllocate(skill.id, lo);
          }}
          slotProps={{ htmlInput: { min: 0, max: maxRanksCanAdd, step: isClassForAnyLevel ? 1 : 0.5 } }}
        />
      </TableCell>
      <TableCell>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {pointsAllocated}
        </Typography>
      </TableCell>
      <TableCell>{skill.currentRank}</TableCell>
      <TableCell>
        <Typography
          variant="body2"
          sx={{ fontWeight: ranksGained > 0 ? 600 : 400, color: ranksGained > 0 ? "primary.main" : "text.secondary" }}
        >
          {skill.currentRank + ranksGained}
        </Typography>
      </TableCell>
      <TableCell>
        {isMultiClass ? (skill.isClassSkill ? "Yes" : "No") : skill.isCurrentClassSkill ? "Yes" : "No"}
      </TableCell>
    </SkillRow>
  );
});

export function SkillsStep({ wizard }: SkillsStepProps) {
  const { skillData, isLoadingSkills, skillsError, control, skillPointAllocations, skillLevels } = wizard;
  // Changed from the points as they fit the slots, which the wizard reads
  const { field: allocationsField } = useController({ control, name: "skillPointAllocations" });
  // Read as a row allocates, so the callback the memoized rows get stays the same
  const latestAllocations = useLatest(skillPointAllocations);
  const setAllocations = allocationsField.onChange;
  const randomAssign = useCallback(() => {
    if (!skillData || !skillLevels) return;

    const skillMaxes = skillData.skills
      .map((skill) => ({ id: skill.id, max: maxSkillPoints(skill, skillData.totalCharacterLevel, skillLevels) }))
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

    setAllocations(allocations);
  }, [skillData, skillLevels, setAllocations]);

  const skillPointsToSpend = skillData?.skillPointsToSpend ?? 0;

  const handleAllocate = useCallback(
    (skillId: string, rawPoints: number) => {
      if (!skillPointsToSpend) return;
      const allocs = latestAllocations.current;
      const currentTotal = Object.entries(allocs)
        .filter(([id]) => id !== skillId)
        .reduce((sum, [, points]) => sum + points, 0);
      const maxFromAvailable = skillPointsToSpend - currentTotal;
      const clamped = Math.max(0, Math.min(rawPoints, maxFromAvailable));
      setAllocations({ ...allocs, [skillId]: clamped });
    },
    [skillPointsToSpend, latestAllocations, setAllocations],
  );

  if (isLoadingSkills) return <DiceSpinner />;
  if (skillsError && !skillData) return <LoadError what="Skills" error={skillsError} />;
  if (!skillData || !skillLevels) return null;

  const pointsSpent = Object.values(skillPointAllocations).reduce((sum, points) => sum + points, 0);
  const pointsRemaining = skillData.skillPointsToSpend - pointsSpent;

  return (
    <Box>
      <Stack spacing={1} sx={{ position: "sticky", top: 0, zIndex: 1, bgcolor: "background.paper", pb: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <SubsectionTitle>Skill Points to Spend: {skillData.skillPointsToSpend}</SubsectionTitle>
          <Button startIcon={<CasinoIcon />} onClick={randomAssign} size="small">
            Auto
          </Button>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
          <Typography
            variant="subtitle2"
            component="p"
            gutterBottom
            sx={{
              color:
                pointsSpent > skillData.skillPointsToSpend
                  ? "error.main"
                  : pointsSpent === skillData.skillPointsToSpend
                    ? "success.main"
                    : "text.secondary",
            }}
          >
            Points Spent: {pointsSpent} / {skillData.skillPointsToSpend}
          </Typography>
          {pointsRemaining > 0 && (
            <Typography variant="subtitle2" component="span" sx={{ color: "warning.main" }}>
              ({pointsRemaining} remaining)
            </Typography>
          )}
        </Stack>
      </Stack>
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ minWidth: 420, tableLayout: "fixed" }}>
          <colgroup>
            <col />
            <Box component="col" sx={{ width: 80 }} />
            <Box component="col" sx={{ width: 55 }} />
            <Box component="col" sx={{ width: 55 }} />
            <Box component="col" sx={{ width: 55 }} />
            <Box component="col" sx={{ width: 55 }} />
          </colgroup>
          <TableHead>
            <TableRow>
              <TableCell>Skill</TableCell>
              <TableCell sx={COLUMN_HEADER_SX}>Add</TableCell>
              <TableCell sx={COLUMN_HEADER_SX}>Used</TableCell>
              <TableCell sx={COLUMN_HEADER_SX}>Rank</TableCell>
              <TableCell sx={COLUMN_HEADER_SX}>Total</TableCell>
              <TableCell sx={COLUMN_HEADER_SX}>Class</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <GroupedSkillRows
              skills={skillData.skills}
              columns={6}
              renderSkill={(skill, { indented, hidden }) => (
                <SkillAllocationRow
                  key={skill.id}
                  skill={skill}
                  totalCharacterLevel={skillData.totalCharacterLevel}
                  pointsAllocated={skillPointAllocations[skill.id] || 0}
                  onAllocate={handleAllocate}
                  indented={indented}
                  hidden={hidden}
                  levels={skillLevels}
                />
              )}
            />
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
