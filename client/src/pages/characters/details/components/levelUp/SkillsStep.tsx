import { Box, Button, Stack, TextField, Typography } from "@mui/material";
import { memo, useCallback } from "react";
import { type Control, useController } from "react-hook-form";

import { GroupedSkillRows, SkillRow } from "@/client/src/components/characters/index.ts";
import {
  DataCell,
  DataTable,
  DiceSpinner,
  LoadError,
  SubsectionTitle,
  type TableColumn,
} from "@/client/src/components/common/index.ts";
import { CasinoIcon } from "@/client/src/components/icons/index.ts";
import { useLatest } from "@/client/src/hooks/index.ts";
import type { RulesDescription } from "@/client/src/lib/queries.ts";
import { formatPointsSpent, pointsSpent } from "@/client/src/pages/characters/pointsSpent.ts";

import type { SkillsData } from "./levelAnswers.ts";
import { OptionTooltip } from "./OptionTooltip.tsx";
import { pointsAt, ranksAt } from "./skillRanks.ts";
import { useCharacterRules } from "./useCharacterRules.ts";
import type { LevelUpFormData } from "./useLevelWizardBase.ts";

interface SkillAllocationRowProps {
  hidden: boolean;
  indented: boolean;
  onAllocate: (skillId: string, rawPoints: number) => void;
  pointsAllocated: number;
  skill: SkillsData["skills"][number];
  words: PointSpendWords;
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
  characterId: string;
  wizard: SkillPickerState;
}

/** The words of a spend of points, its rules': what a point buys ("Rank"), and a row it's cheaper on ("Class Skill"). */
type PointSpendWords = RulesDescription["levelUp"]["pointSpend"];

/** The narrow number columns' headers, smaller */
const NARROW_HEADERS_SX = {
  "& > thead th:not(:first-of-type)": { whiteSpace: "nowrap", fontSize: "0.8125rem" },
};

const SkillAllocationRow = memo(function SkillAllocationRow({
  skill,
  pointsAllocated,
  onAllocate,
  indented,
  hidden,
  words,
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
      <DataCell slot="trailing">
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
              "aria-label": `${skill.name} ${words.unit.many} to Add`,
            },
          }}
        />
      </DataCell>
      <DataCell slot="labeled" label="Used">
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {pointsAllocated}
        </Typography>
      </DataCell>
      <DataCell slot="labeled" label={words.unit.one}>
        {skill.currentRank}
      </DataCell>
      <DataCell slot="labeled" label="Total">
        <Typography
          variant="body2"
          sx={{ fontWeight: ranksGained > 0 ? 600 : 400, color: ranksGained > 0 ? "primary.main" : "text.secondary" }}
        >
          {skill.currentRank + ranksGained}
        </Typography>
      </DataCell>
      <DataCell slot={skill.classSkill ? "inline" : "hidden"} phoneChildren={words.favored}>
        {skill.classSkill ? "Yes" : "No"}
      </DataCell>
    </SkillRow>
  );
});

/**
 * A skill's columns, in its rules' words (`words`): on a phone, its name leads, the ranks it adds at the line's end, and
 * what it comes to under them
 */
function skillColumns(words: PointSpendWords): TableColumn[] {
  return [
    { key: "skill", label: "Skill" },
    { key: "add", label: "Add", width: "80px" },
    { key: "used", label: "Used", width: "55px" },
    { key: "rank", label: words.unit.one, width: "55px" },
    { key: "total", label: "Total", width: "55px" },
    { key: "class", label: words.favoredShort, width: "55px" },
  ];
}

export function SkillsStep({ characterId, wizard }: SkillsStepProps) {
  // Its rules' words for what a point buys and a row it's cheaper on
  const words = useCharacterRules(characterId).rules?.levelUp.pointSpend;
  const { skillData, isLoadingSkills, skillsError, control, skillPointAllocations } = wizard;
  // Changed from the points as they fit the slots, which the wizard reads
  const { field: allocationsField } = useController({ control, name: "skillPointAllocations" });
  // Read as a row allocates, so the callback the memoized rows get stays the same
  const latestAllocations = useLatest(skillPointAllocations);
  const setAllocations = allocationsField.onChange;
  const randomAssign = () => {
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
  };

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
  if (!skillData || !words) return null;
  const columns = skillColumns(words);

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
      <DataTable size="small" columns={columns} minWidth={420} fixed sx={NARROW_HEADERS_SX}>
        <GroupedSkillRows
          skills={skillData.skills}
          columns={columns.length}
          renderSkill={(skill, { indented, hidden }) => (
            <SkillAllocationRow
              key={skill.id}
              skill={skill}
              pointsAllocated={skillPointAllocations[skill.id] || 0}
              onAllocate={handleAllocate}
              indented={indented}
              hidden={hidden}
              words={words}
            />
          )}
        />
      </DataTable>
    </Box>
  );
}
