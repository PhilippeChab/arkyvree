import { alpha, Autocomplete, Box, Stack, TextField, type Theme, Typography } from "@mui/material";
import type { ReactNode, UIEvent } from "react";

import { AddButton, BlankNote, RowAction, ScrollSafeListbox } from "@/client/src/components/common/index.ts";
import { DeleteIcon } from "@/client/src/components/icons/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";

import type { StepOf, StepOption } from "./levelPlanQueries.ts";
import { OptionTooltip } from "./OptionTooltip.tsx";
import { canPlan, hasRoom, plannedPosition } from "./planSlots.ts";
import { useCharacterRules } from "./useCharacterRules.ts";

/** The plan a level wizard hands its `plan` step, and its options. */
interface PlanState {
  /** The words its advancements take: a position's ("Level"). */
  advancementWords: { position: { many: string; one: string } } | undefined;
  handleAddSlot: () => void;
  handleQuickAdd: (option: StepOption) => void;
  handleRemoveSlot: (index: number) => void;
  handleSlotChange: (index: number, option: StepOption | null) => void;
  /** The tracks planned, in order, a slot not filled yet `null`. */
  plan: (StepOption | null)[];
  planOptions: {
    /** Why the options didn't load, said where they'd show. */
    error: unknown;
    /** The options the search finds, for an empty slot's picker. */
    items: StepOption[];
    loading: boolean;
    onScroll: (event: UIEvent<HTMLElement>) => void;
    /** The options the search doesn't narrow, for the quick-add buttons: searching keeps the character's own. */
    quickAdd: StepOption[];
    setSearch: (search: string) => void;
  };
  slotKeys: number[];
}

interface PlanStepProps {
  characterId: string;
  step: StepOf<"plan">;
  wizard: PlanState;
}

interface SlotProps {
  children: ReactNode;
  /** The slot's place in the plan, from 0: its remove's name counts from 1 ("Remove Level 2"). */
  index: number;
  onRemove: (index: number) => void;
  /** A position's word ("Level"). */
  position: string;
}

/**
 * A planned advancement, filling its slot's row as an empty slot's picker does: filled, its track and position centered,
 * framed as a chip is.
 */
const PLANNED_SX = {
  flex: 1,
  minHeight: 46,
  px: 1.5,
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  bgcolor: "action.selected",
  border: 1,
  borderColor: (theme: Theme) => alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.4 : 0.2),
  borderRadius: 0.5,
} as const;

/** A slot's row, a picker's height: what fills it (a planned advancement, an empty slot's picker), then its remove. */
function Slot({ index, onRemove, position, children }: SlotProps) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ minHeight: 56, alignItems: "center" }}>
      {children}
      <RowAction
        icon={DeleteIcon}
        label={`Remove ${position} ${index + 1}`}
        intent="destructive"
        onClick={() => onRemove(index)}
      />
    </Stack>
  );
}

/**
 * A `plan` step: the tracks the plan's advancements take, in order (3.5's classes), each at its next position, an empty
 * slot's picker searching the options, and a quick-add button per track the character has or the plan takes.
 */
export function PlanStep({ characterId, step, wizard }: PlanStepProps) {
  const { rules } = useCharacterRules(characterId);
  const {
    advancementWords,
    handleAddSlot,
    handleQuickAdd,
    handleRemoveSlot,
    handleSlotChange,
    plan,
    planOptions,
    slotKeys,
  } = wizard;
  // Its rules' words: a position's ("Level"), and what it plans ("Classes")
  const position = advancementWords?.position ?? { many: "", one: "" };
  const options = entityTypeLabel(step.kind ?? "", rules?.words, true);

  // A button adds a track at the end of the plan, at the position after those planned: "+ Wizard 3" once Wizard 2 is.
  // It pushes the track as the server gives it, which the wizard numbers in its place. The character's own tracks first
  // (a next position past 1 means one taken), from the unsearched options, so searching drops none of them
  const quickAdd = planOptions.quickAdd.filter((option) => (option.track?.next ?? 1) > 1 && option.eligible);
  // Then any planned track not already among them
  const seen = new Set(quickAdd.map((option) => option.id));
  for (const option of plan) {
    if (!option || seen.has(option.id)) continue;
    seen.add(option.id);
    quickAdd.push(option);
  }

  // The plan stops at the character's last advancement: every option says how many are left
  const left = planOptions.quickAdd[0]?.track?.left;
  const room = hasRoom(plan, left);

  return (
    <Stack spacing={0.5}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
        <AddButton variant="text" size="small" label={`Add ${position.one}`} onClick={handleAddSlot} disabled={!room} />
        {quickAdd.map((option) => (
          <AddButton
            key={option.id}
            variant="text"
            size="small"
            label={`${option.name} ${plannedPosition(option, plan)}`}
            onClick={() => handleQuickAdd(option)}
            disabled={!canPlan(option, plan, left)}
          />
        ))}
      </Stack>
      {!room && (
        <BlankNote>
          No more {position.many.toLowerCase()}: a character stops at its last {position.one.toLowerCase()}
        </BlankNote>
      )}
      {plan.map((planned, index) => (
        <Slot key={slotKeys[index]} index={index} onRemove={handleRemoveSlot} position={position.one}>
          {planned ? (
            <Stack sx={PLANNED_SX}>
              <Typography>{`${planned.name} — ${position.one} ${plannedPosition(planned, plan, index)}`}</Typography>
            </Stack>
          ) : (
            <Autocomplete<StepOption>
              sx={{ flex: 1 }}
              options={planOptions.items}
              loading={planOptions.loading}
              noOptionsText={emptyOptionsText(options, planOptions.error)}
              value={null}
              onChange={(_, value) => {
                if (value) handleSlotChange(index, value);
              }}
              onInputChange={(_, inputValue, reason) => {
                if (reason === "input") planOptions.setSearch(inputValue);
              }}
              filterOptions={(x) => x}
              getOptionLabel={(option) => `${option.name} — ${position.one} ${plannedPosition(option, plan, index)}`}
              getOptionDisabled={(option) => !option.eligible}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              renderOption={({ key, ...props }, option) => {
                const next = `${position.one} ${plannedPosition(option, plan, index)}`;
                return (
                  <OptionTooltip
                    key={key}
                    description={option.description}
                    requirementTree={!option.eligible ? option.requirementTree : undefined}
                    descriptionWidth={500}
                  >
                    <li {...props} style={{ ...props.style, pointerEvents: "auto" }}>
                      <Box>
                        <Typography>{option.name}</Typography>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          {option.eligible ? next : `${next} — ${step.words.unmet}`}
                        </Typography>
                      </Box>
                    </li>
                  </OptionTooltip>
                );
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={`${position.one} ${index + 1}`}
                  placeholder={`Search ${options.toLowerCase()}…`}
                />
              )}
              slotProps={{
                listbox: {
                  component: ScrollSafeListbox,
                  onScroll: planOptions.onScroll,
                },
              }}
            />
          )}
        </Slot>
      ))}
    </Stack>
  );
}
