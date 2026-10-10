import { Autocomplete, Box, IconButton, Stack, TextField, Typography } from "@mui/material";
import { type UIEvent, useMemo } from "react";

import { AddButton, ScrollSafeListbox, ValueChip } from "@/client/src/components/common/index.ts";
import { DeleteIcon } from "@/client/src/components/icons/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import {
  type AvailableKlass,
  plannedLevel,
  type SelectedKlass,
} from "@/client/src/pages/characters/details/components/levelUp/index.ts";

import { OptionTooltip } from "./OptionTooltip.tsx";

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
  const quickAddClasses = useMemo(() => {
    // Start with the character's existing classes (nextLevel > 1 means already
    // taken). Use the unfiltered `quickAddKlasses` snapshot so searching in
    // the Autocomplete doesn't drop existing-class buttons from the row.
    const existing: SelectedKlass[] = quickAddKlasses
      .filter((k) => k.nextLevel > 1 && k.eligible)
      .map((k) => ({
        id: k.id,
        name: k.name,
        nextLevel: k.nextLevel,
        maxLevel: k.maxLevel,
        hd: k.hd,
        eligible: k.eligible,
      }));

    // Add any selected classes not already in the list
    const seen = new Set(existing.map((k) => k.id));
    for (const k of levels) {
      if (!k || seen.has(k.id)) continue;
      seen.add(k.id);
      existing.push(k);
    }

    return existing.map((klass) => ({ klass, level: plannedLevel(klass, levels) }));
  }, [levels, quickAddKlasses]);

  return (
    <Stack spacing={0.5}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
        <AddButton variant="text" size="small" label="Add Level" onClick={onAddLevel} />
        {quickAddClasses.map(({ klass, level }) => (
          <AddButton
            key={klass.id}
            variant="text"
            size="small"
            label={`${klass.name} ${level}`}
            onClick={() => onQuickAddLevel(klass)}
            disabled={level > klass.maxLevel}
          />
        ))}
      </Stack>
      {levels.map((selectedKlass, index) =>
        selectedKlass ? (
          <Stack key={slotKeys[index]} direction="row" sx={{ height: 56, alignItems: "center" }}>
            <ValueChip
              color="default"
              label={`${selectedKlass.name} — Level ${selectedKlass.nextLevel}`}
              onDelete={() => onRemoveLevel(index)}
            />
          </Stack>
        ) : (
          <Stack key={slotKeys[index]} direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
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
            <IconButton size="small" aria-label={`Remove Level ${index + 1}`} onClick={() => onRemoveLevel(index)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
        ),
      )}
    </Stack>
  );
}
