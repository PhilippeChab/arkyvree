import { alpha, Autocomplete, Box, Stack, TextField, type Theme, Typography } from "@mui/material";
import type { ReactNode, UIEvent } from "react";

import { AddButton, BlankNote, RowAction, ScrollSafeListbox } from "@/client/src/components/common/index.ts";
import { DeleteIcon } from "@/client/src/components/icons/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";

import { canPlanLevel, hasRoomForLevel, plannedLevel } from "./classPlan.ts";
import { OptionTooltip } from "./OptionTooltip.tsx";
import type { AvailableKlass, SelectedKlass } from "./useLevelWizardBase.ts";

/** The class plan a level wizard hands the Class Plan step, and the class picker's list. */
interface AddClassPlanState {
  /** The classes the search finds, for an empty slot's picker. */
  availableKlasses: AvailableKlass[];
  classPlan: (SelectedKlass | null)[];
  handleAddLevel: () => void;
  handleClassChange: (index: number, klass: SelectedKlass | null) => void;
  handleKlassesScroll: (event: UIEvent<HTMLElement>) => void;
  handleQuickAddLevel: (klass: SelectedKlass) => void;
  handleRemoveLevel: (index: number) => void;
  isLoadingKlasses: boolean;
  /** Why the classes didn't load, said where they'd show. */
  klassesError: unknown;
  /** The classes the search doesn't narrow, for the quick-add buttons: searching keeps the character's own. */
  quickAddKlasses: AvailableKlass[];
  setKlassSearch: (search: string) => void;
  slotKeys: number[];
}

interface AddClassPlanStepProps {
  wizard: AddClassPlanState;
}

interface LevelSlotProps {
  children: ReactNode;
  /** The slot's place in the plan, from 0: its remove's name counts from 1 ("Remove Level 2"). */
  index: number;
  onRemove: (index: number) => void;
}

/**
 * A planned level, filling its slot's row as an empty slot's class picker does: filled, its class and level centered,
 * framed as a chip is.
 */
const PLANNED_LEVEL_SX = {
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

/** A slot's row, a class picker's height: what fills it (a planned level, an empty slot's picker), then its remove. */
function LevelSlot({ index, onRemove, children }: LevelSlotProps) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ minHeight: 56, alignItems: "center" }}>
      {children}
      <RowAction
        icon={DeleteIcon}
        label={`Remove Level ${index + 1}`}
        intent="destructive"
        onClick={() => onRemove(index)}
      />
    </Stack>
  );
}

export function AddClassPlanStep({ wizard }: AddClassPlanStepProps) {
  const {
    availableKlasses,
    classPlan: levels,
    handleAddLevel: onAddLevel,
    handleClassChange: onClassChange,
    handleKlassesScroll,
    handleQuickAddLevel: onQuickAddLevel,
    handleRemoveLevel: onRemoveLevel,
    isLoadingKlasses,
    klassesError,
    quickAddKlasses,
    setKlassSearch,
    slotKeys,
  } = wizard;

  // A button adds a class at the end of the plan, at the level after those planned: "+ Wizard 3" once Wizard 2 is.
  // It pushes the class as the server gives it, which the wizard numbers in its place.
  // Start with the character's existing classes (nextLevel > 1 means already taken), from the unfiltered
  // `quickAddKlasses` snapshot, so searching in the Autocomplete doesn't drop existing-class buttons from the row
  const quickAdd: SelectedKlass[] = quickAddKlasses.filter((k) => k.nextLevel > 1 && k.eligible);
  // Then any selected class not already in the list
  const seen = new Set(quickAdd.map((k) => k.id));
  for (const k of levels) {
    if (!k || seen.has(k.id)) continue;
    seen.add(k.id);
    quickAdd.push(k);
  }
  const quickAddClasses = quickAdd.map((klass) => ({ klass, level: plannedLevel(klass, levels) }));

  // The plan stops at the character's last level: every class's option says how many levels it has left
  const levelsLeft = quickAddKlasses[0]?.levelsLeft;
  const hasRoom = hasRoomForLevel(levels, levelsLeft);

  return (
    <Stack spacing={0.5}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
        <AddButton variant="text" size="small" label="Add Level" onClick={onAddLevel} disabled={!hasRoom} />
        {quickAddClasses.map(({ klass, level }) => (
          <AddButton
            key={klass.id}
            variant="text"
            size="small"
            label={`${klass.name} ${level}`}
            onClick={() => onQuickAddLevel(klass)}
            disabled={!canPlanLevel(klass, levels, levelsLeft)}
          />
        ))}
      </Stack>
      {!hasRoom && <BlankNote>No more levels: a character stops at its last level</BlankNote>}
      {levels.map((selectedKlass, index) => (
        <LevelSlot key={slotKeys[index]} index={index} onRemove={onRemoveLevel}>
          {selectedKlass ? (
            <Stack sx={PLANNED_LEVEL_SX}>
              <Typography>{`${selectedKlass.name} — Level ${selectedKlass.nextLevel}`}</Typography>
            </Stack>
          ) : (
            <Autocomplete<AvailableKlass>
              sx={{ flex: 1 }}
              options={availableKlasses}
              loading={isLoadingKlasses}
              noOptionsText={emptyOptionsText("Classes", klassesError)}
              value={null}
              onChange={(_, value) => {
                if (value) onClassChange(index, value);
              }}
              onInputChange={(_, inputValue, reason) => {
                if (reason === "input") setKlassSearch(inputValue);
              }}
              filterOptions={(x) => x}
              getOptionLabel={(option) => {
                const adjustedLevel = plannedLevel(option, levels, index);
                return `${option.name} — Level ${adjustedLevel}`;
              }}
              getOptionDisabled={(option) => !option.eligible}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              renderOption={({ key, ...props }, option) => {
                const adjustedLevel = plannedLevel(option, levels, index);
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
                          {option.eligible ? `Level ${adjustedLevel}` : `Level ${adjustedLevel} — Requirements not met`}
                        </Typography>
                      </Box>
                    </li>
                  </OptionTooltip>
                );
              }}
              renderInput={(params) => (
                <TextField {...params} label={`Level ${index + 1}`} placeholder="Search classes…" />
              )}
              slotProps={{
                listbox: {
                  component: ScrollSafeListbox,
                  onScroll: handleKlassesScroll,
                },
              }}
            />
          )}
        </LevelSlot>
      ))}
    </Stack>
  );
}
