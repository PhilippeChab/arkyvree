import { Box, Button, Stack, TextField, Typography } from "@mui/material";
import { memo } from "react";
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
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import { formatPointsSpent, pointsSpent } from "@/client/src/pages/characters/pointsSpent.ts";

import { type AnswerOf, answerOf, type PlanAnswer, type StepOf } from "./levelPlanQueries.ts";
import { OptionTooltip } from "./OptionTooltip.tsx";
import type { LevelPlanForm } from "./planRequest.ts";
import { pointsAt, valueAt } from "./spentValues.ts";
import { useCharacterRules } from "./useCharacterRules.ts";

interface SpendRowProps {
  hidden: boolean;
  indented: boolean;
  onSpend: (rowId: string, points: number) => void;
  points: number;
  row: GroupedRow;
  words: StepOf<"spend">["words"];
}

/** What a level wizard hands its `spend` step: the plan's answer, and the form's points as they fit it. */
interface SpendState {
  answer: PlanAnswer | undefined;
  answerError: Error | null;
  /** The plan's form: its points, which the step changes */
  control: Control<LevelPlanForm>;
  /** The form as the answer fits it: its points, each row's up to the most it keeps */
  fitted: LevelPlanForm;
  isAnswering: boolean;
}

interface SpendStepProps {
  characterId: string;
  step: StepOf<"spend">;
  wizard: SpendState;
}

/** A row of a `spend` answer, with its group as the grouped rows read it (`family`). */
type GroupedRow = AnswerOf<"spend">["rows"][number] & { family: string | null };

/** The narrow number columns' headers, smaller */
const NARROW_HEADERS_SX = {
  "& > thead th:not(:first-of-type)": { whiteSpace: "nowrap", fontSize: "0.8125rem" },
};

const SpendRow = memo(function SpendRow({ row, points, onSpend, indented, hidden, words }: SpendRowProps) {
  // As the step answers them: the value the points buy, and the most the row gains
  const gained = valueAt(row, points);
  const maxGain = valueAt(row, row.valuesByPoints.length - 1);

  return (
    <SkillRow
      name={row.name}
      shortName={row.shortName}
      indented={indented}
      hidden={hidden}
      renderName={(label) =>
        row.description ? (
          <OptionTooltip description={row.description}>
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
          value={gained || ""}
          onChange={(e) => onSpend(row.id, pointsAt(row, parseFloat(e.target.value) || 0))}
          slotProps={{
            htmlInput: {
              min: 0,
              max: maxGain,
              step: row.step,
              // Named by its row, which its column adds value to
              "aria-label": `${row.name} ${words.unit.many} to Add`,
            },
          }}
        />
      </DataCell>
      <DataCell slot="labeled" label="Used">
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {points}
        </Typography>
      </DataCell>
      <DataCell slot="labeled" label={words.unit.one}>
        {row.current}
      </DataCell>
      <DataCell slot="labeled" label="Total">
        <Typography
          variant="body2"
          sx={{ fontWeight: gained > 0 ? 600 : 400, color: gained > 0 ? "primary.main" : "text.secondary" }}
        >
          {row.current + gained}
        </Typography>
      </DataCell>
      <DataCell slot={row.favored ? "inline" : "hidden"} phoneChildren={words.favored}>
        {row.favored ? "Yes" : "No"}
      </DataCell>
    </SkillRow>
  );
});

/**
 * A row's columns, in its step's words (`words`) and its kind's (`rowWord`): on a phone, its name leads, the value it
 * adds at the line's end, and what it comes to under them
 */
function spendColumns(rowWord: string, words: StepOf<"spend">["words"]): TableColumn[] {
  return [
    { key: "row", label: rowWord },
    { key: "add", label: "Add", width: "80px" },
    { key: "used", label: "Used", width: "55px" },
    { key: "value", label: words.unit.one, width: "55px" },
    { key: "total", label: "Total", width: "55px" },
    { key: "favored", label: words.favoredShort, width: "55px" },
  ];
}

/**
 * A `spend` step: a budget of points spent over rows (3.5's skill points over skills), each buying value at its own
 * rate, as the plan's answer says; spent by hand or at random.
 */
export function SpendStep({ characterId, step, wizard }: SpendStepProps) {
  const { rules } = useCharacterRules(characterId);
  const { answer, answerError, control, fitted, isAnswering } = wizard;
  const spend = answerOf(answer, step);
  // Changed from the points as they fit, which the wizard reads
  // The form's points, every step's: a step replaces them whole, so the wizard sees a new plan
  const { field } = useController({ control, name: "points" });
  const points = fitted.points[step.name] ?? {};
  // Read as a row spends, so the callback the memoized rows get stays the same
  const latestPoints = useLatest(points);
  const latestForm = useLatest(field.value);
  const { onChange } = field;
  const setPoints = (spent: Record<string, number>) => onChange({ ...latestForm.current, [step.name]: spent });
  const budget = spend?.budget ?? 0;

  // The compiler keeps it the same while the budget is: it reads the points as they stand
  const handleSpend = (rowId: string, wanted: number) => {
    if (!budget) return;
    const spent = latestPoints.current;
    // What the other rows spend
    const spentElsewhere = pointsSpent(spent) - (spent[rowId] ?? 0);
    const clamped = Math.max(0, Math.min(wanted, budget - spentElsewhere));
    setPoints({ ...spent, [rowId]: clamped });
  };

  if (isAnswering) return <DiceSpinner />;
  if (answerError && !answer) return <LoadError what={step.label} error={answerError} />;
  if (!spend) return null;
  const { words } = step;
  const columns = spendColumns(entityTypeLabel(step.kind ?? "", rules?.words), words);
  const rows = spend.rows.map((row): GroupedRow => ({ ...row, family: row.group }));

  const randomSpend = () => {
    // Each row up to the most it takes spent alone: the step keeps what the points come to once all are spent
    const maxes = spend.rows.filter((row) => row.maxPoints > 0);
    const spent: Record<string, number> = {};
    let remaining = budget;
    while (remaining > 0) {
      const open = maxes.filter((row) => (spent[row.id] ?? 0) < row.maxPoints);
      if (open.length === 0) break;
      const pick = open[Math.floor(Math.random() * open.length)];
      spent[pick.id] = (spent[pick.id] ?? 0) + 1;
      remaining--;
    }
    setPoints(spent);
  };

  const spent = pointsSpent(points);
  const remaining = budget - spent;

  return (
    <Box>
      <Stack spacing={1} sx={{ position: "sticky", top: 0, zIndex: 1, bgcolor: "background.paper", pb: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <SubsectionTitle>
            {words.budget}: {budget}
          </SubsectionTitle>
          <Button startIcon={<CasinoIcon />} onClick={randomSpend} size="small">
            Auto
          </Button>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
          <Typography
            variant="subtitle2"
            component="p"
            gutterBottom
            sx={{ color: spent > budget ? "error.main" : spent === budget ? "success.main" : "text.secondary" }}
          >
            {formatPointsSpent(spent, budget)}
          </Typography>
          {remaining > 0 && (
            <Typography variant="subtitle2" component="span" sx={{ color: "warning.main" }}>
              ({remaining} remaining)
            </Typography>
          )}
        </Stack>
      </Stack>
      <DataTable size="small" columns={columns} minWidth={420} fixed sx={NARROW_HEADERS_SX}>
        <GroupedSkillRows
          skills={rows}
          columns={columns.length}
          renderSkill={(row, { indented, hidden }) => (
            <SpendRow
              key={row.id}
              row={row}
              points={points[row.id] || 0}
              onSpend={handleSpend}
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
