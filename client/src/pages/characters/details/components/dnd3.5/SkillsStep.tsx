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
import type { LevelUpFormData } from "@/client/src/pages/characters/details/components/useLevelWizardBase.ts";
import { formatPointsSpent, pointsSpent } from "@/client/src/pages/characters/pointsSpent.ts";

import { pointsAt, ranksAt, type SkillsData } from "./levelUp/index.ts";
import { OptionTooltip } from "./OptionTooltip.tsx";

interface SkillAllocationRowProps {
  hidden: boolean;
  indented: boolean;
  onAllocate: (skillId: string, rawPoints: number) => void;
  pointsAllocated: number;
  skill: SkillsData["skills"][number];
}

/** The skill points state a level wizard hands the Skills step. */
interface SkillPickerState {
  /** The picks' form: the skill points field, which the step changes from `skillPointAllocations`. */
  control: Control<LevelUpFormData>;
  isLoadingSkills: boolean;
  /** The points to spend, and each skill's spending over the levels: the planned ones (Add Level), or the edited one. */
  skillData: SkillsData | null | undefined;
  /** The points as they fit the slots */
  skillPointAllocations: Record<string, number>;
  skillsError: Error | null;
}

interface SkillsStepProps {
  wizard: SkillPickerState;
}

/** The narrow number columns' headers. */
const COLUMN_HEADER_SX = { whiteSpace: "nowrap", fontSize: { xs: "0.7rem", sm: "0.8125rem" } };

const SkillAllocationRow = memo(function SkillAllocationRow({
  skill,
  pointsAllocated,
  onAllocate,
  indented,
  hidden,
}: SkillAllocationRowProps) {
  // As the step answers them: the ranks the points buy, and the most the skill gains
  const ranksGained = ranksAt(skill, pointsAllocated);
  const maxRanksCanAdd = ranksAt(skill, skill.ranksByPoints.length - 1);

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
          onChange={(e) => onAllocate(skill.id, pointsAt(skill, parseFloat(e.target.value) || 0))}
          slotProps={{
            htmlInput: {
              min: 0,
              max: maxRanksCanAdd,
              step: skill.rankStep,
              // Named by its row's skill, which its column adds ranks to
              "aria-label": `${skill.name} Ranks to Add`,
            },
          }}
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
      <TableCell>{skill.classSkill ? "Yes" : "No"}</TableCell>
    </SkillRow>
  );
});

export function SkillsStep({ wizard }: SkillsStepProps) {
  const { skillData, isLoadingSkills, skillsError, control, skillPointAllocations } = wizard;
  // Changed from the points as they fit the slots, which the wizard reads
  const { field: allocationsField } = useController({ control, name: "skillPointAllocations" });
  // Read as a row allocates, so the callback the memoized rows get stays the same
  const latestAllocations = useLatest(skillPointAllocations);
  const setAllocations = allocationsField.onChange;
  const randomAssign = useCallback(() => {
    if (!skillData) return;

    // Each skill up to the most it takes spent alone: the step keeps what the points come to once all are spent
    const skillMaxes = skillData.skills
      .map((skill) => ({ id: skill.id, max: skill.maxPoints }))
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
  }, [skillData, setAllocations]);

  const skillPointsToSpend = skillData?.skillPointsToSpend ?? 0;

  const handleAllocate = useCallback(
    (skillId: string, rawPoints: number) => {
      if (!skillPointsToSpend) return;
      const allocs = latestAllocations.current;
      // What the other skills spend
      const spentElsewhere = pointsSpent(allocs) - (allocs[skillId] ?? 0);
      const maxFromAvailable = skillPointsToSpend - spentElsewhere;
      const clamped = Math.max(0, Math.min(rawPoints, maxFromAvailable));
      setAllocations({ ...allocs, [skillId]: clamped });
    },
    [skillPointsToSpend, latestAllocations, setAllocations],
  );

  if (isLoadingSkills) return <DiceSpinner />;
  if (skillsError && !skillData) return <LoadError what="Skills" error={skillsError} />;
  if (!skillData) return null;

  const spent = pointsSpent(skillPointAllocations);
  const pointsRemaining = skillData.skillPointsToSpend - spent;

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
                spent > skillData.skillPointsToSpend
                  ? "error.main"
                  : spent === skillData.skillPointsToSpend
                    ? "success.main"
                    : "text.secondary",
            }}
          >
            {formatPointsSpent(spent, skillData.skillPointsToSpend)}
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
                  pointsAllocated={skillPointAllocations[skill.id] || 0}
                  onAllocate={handleAllocate}
                  indented={indented}
                  hidden={hidden}
                />
              )}
            />
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
