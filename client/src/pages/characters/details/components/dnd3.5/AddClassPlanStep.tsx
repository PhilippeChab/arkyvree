import { Autocomplete, Box, Chip, IconButton, Stack, TextField, Typography } from "@mui/material";
import { useMemo } from "react";

import { AddButton, ScrollSafeListbox } from "@/client/src/components/common/index.ts";
import { CloseIcon } from "@/client/src/components/icons/index.ts";

import type { AvailableKlass } from "./levelUp/index.ts";
import type { AddClassPlanStepProps } from "./levelUpFactory.ts";
import { OptionTooltip } from "./OptionTooltip.tsx";

export function AddClassPlanStep({
  wizard,
  availableKlasses,
  quickAddKlasses,
  isLoadingKlasses,
  handleKlassListScroll,
  setKlassSearch,
}: AddClassPlanStepProps) {
  const {
    classPlan: levels,
    slotKeys,
    handleClassChange: onClassChange,
    handleAddLevel: onAddLevel,
    handleQuickAddLevel: onQuickAddLevel,
    handleRemoveLevel: onRemoveLevel,
  } = wizard;
  const getAdjustedNextLevel = (klassId: string, index: number) => {
    const klass = availableKlasses.find((k) => k.id === klassId) ?? quickAddKlasses.find((k) => k.id === klassId);
    if (!klass) return 0;
    const selectedBefore = levels.slice(0, index).filter((k) => k !== null && k.id === klassId).length;
    return klass.nextLevel + selectedBefore;
  };

  // Count of each class already queued in this session. Used to offset the
  // button label so clicking "+ Wizard" after queueing Wizard 2 shows
  // "Wizard 3". The underlying klass object stays raw — `adjustedClassPlan`
  // in the wizard hook applies the same offset when the click pushes onto
  // classPlan, so double-adjusting here would cause level skips.
  const queuedCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const k of levels) if (k) m.set(k.id, (m.get(k.id) ?? 0) + 1);

    return m;
  }, [levels]);

  const quickAddClasses = useMemo(() => {
    // Start with the character's existing classes (nextLevel > 1 means already
    // taken). Use the unfiltered `quickAddKlasses` snapshot so searching in
    // the Autocomplete doesn't drop existing-class buttons from the row.
    const existing = quickAddKlasses
      .filter((k) => k.nextLevel > 1 && k.eligible)
      .map((k) => ({
        id: k.id,
        name: k.name,
        nextLevel: k.nextLevel,
        maxLevel: k.maxLevel,
        hd: k.hd,
        eligible: k.eligible,
        atMax: k.nextLevel + (queuedCounts.get(k.id) ?? 0) - 1 >= k.maxLevel,
      }));

    // Add any selected classes not already in the list
    const seen = new Set(existing.map((k) => k.id));
    for (const k of levels) {
      if (!k || seen.has(k.id)) continue;
      seen.add(k.id);
      existing.push({
        ...k,
        atMax: k.nextLevel + (queuedCounts.get(k.id) ?? 1) - 1 >= k.maxLevel,
      });
    }

    return existing;
  }, [levels, quickAddKlasses, queuedCounts]);

  return (
    <Stack spacing={0.5}>
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
        <AddButton variant="text" size="small" label="Add Level" onClick={onAddLevel} />
        {quickAddClasses.map((klass) => (
          <AddButton
            key={klass.id}
            variant="text"
            size="small"
            label={`${klass.name} ${klass.nextLevel + (queuedCounts.get(klass.id) ?? 0)}`}
            onClick={() => onQuickAddLevel(klass)}
            disabled={klass.atMax}
          />
        ))}
      </Stack>
      {levels.map((selectedKlass, index) =>
        selectedKlass ? (
          <Stack key={slotKeys[index]} direction="row" sx={{ height: 56, alignItems: "center" }}>
            <Chip
              label={`${selectedKlass.name} — Level ${selectedKlass.nextLevel}`}
              onDelete={() => onRemoveLevel(index)}
              size="medium"
              sx={{
                height: 46,
                fontSize: "1rem",
                width: "100%",
                "& .MuiChip-label": { flex: 1, textAlign: "center" },
                "& .MuiChip-deleteIcon": { position: "absolute", right: 8 },
              }}
            />
          </Stack>
        ) : (
          <Stack key={slotKeys[index]} direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <Autocomplete<AvailableKlass>
              sx={{ flex: 1 }}
              options={availableKlasses}
              loading={isLoadingKlasses}
              value={null}
              onChange={(_, value) => {
                if (value) onClassChange(index, value);
              }}
              onInputChange={(_, inputValue, reason) => {
                if (reason === "input") setKlassSearch(inputValue);
              }}
              filterOptions={(x) => x}
              getOptionLabel={(option) => {
                const adjustedLevel = getAdjustedNextLevel(option.id, index);
                return `${option.name} — Level ${adjustedLevel}`;
              }}
              getOptionDisabled={(option) => !option.eligible}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              renderOption={({ key, ...props }, option) => {
                const adjustedLevel = getAdjustedNextLevel(option.id, index);
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
                <TextField {...params} label={`Level ${index + 1}`} placeholder="Search classes..." />
              )}
              slotProps={{
                listbox: {
                  component: ScrollSafeListbox,
                  onScroll: handleKlassListScroll,
                },
              }}
            />
            <IconButton size="small" aria-label={`Remove level ${index + 1}`} onClick={() => onRemoveLevel(index)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        ),
      )}
    </Stack>
  );
}
