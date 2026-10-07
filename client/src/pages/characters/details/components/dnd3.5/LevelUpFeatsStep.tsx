import {
  Box,
  Button,
  Chip,
  Collapse,
  List,
  ListItemButton,
  ListItemText,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useController } from "react-hook-form";

import {
  BlankNote,
  ChoiceChip,
  DiceSpinner,
  ExpandArrow,
  LoadError,
  NextPageSpinner,
  SubsectionTitle,
  ToggleLabel,
} from "@/client/src/components/common/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { itemsBeforeLastPage, pageItems } from "@/client/src/lib/pageItems.ts";
import { fadeInUpSx } from "@/client/src/theme/animations.ts";

import {
  type AptitudePool,
  availableFeatFamilyQuery,
  type FeatsData,
  type PickerLevel,
  type SelectedFeat,
  withoutPick,
} from "./levelUp/index.ts";
import type { LevelUpFeatsStepProps } from "./levelUpFactory.ts";
import { OptionTooltip } from "./OptionTooltip.tsx";

interface AutoGrantedFeatsProps {
  defaultCollapsed: boolean;
  feats: FeatsData["autoGrantedFeats"];
}

interface FeatFamilyExpansionProps {
  aptitudeId: string;
  characterId: string;
  family: string;
  onSelectedFeatsChange: (value: Record<string, SelectedFeat[]>) => void;
  /** The level the family's row is checked at, so its variants are checked at it too. */
  picker: PickerLevel;
  selectedAptitude: string;
  selectedFeats: Record<string, SelectedFeat[]>;
}

function AutoGrantedFeats({ feats, defaultCollapsed }: AutoGrantedFeatsProps) {
  const [open, setOpen] = useState(!defaultCollapsed);
  return (
    <Box>
      <SubsectionTitle component="h4">
        <ToggleLabel open={open} onToggle={() => setOpen(!open)}>
          Auto-Granted Feats ({feats.length})
        </ToggleLabel>
      </SubsectionTitle>
      <Collapse in={open}>
        <List dense>
          {feats.map((feat, i) => (
            <ListItemText key={`${feat.id}-${i}`} primary={feat.name} />
          ))}
        </List>
      </Collapse>
    </Box>
  );
}

function FeatFamilyExpansion({
  characterId,
  aptitudeId,
  family,
  picker,
  selectedAptitude,
  selectedFeats,
  onSelectedFeatsChange,
}: FeatFamilyExpansionProps) {
  const query = useInfiniteQuery({
    ...availableFeatFamilyQuery(characterId, aptitudeId, family, picker),
    placeholderData: keepPreviousData,
  });

  const variants = pageItems(query.data);
  const previousItemCount = itemsBeforeLastPage(query.data);

  if (query.isLoading) {
    return (
      <Box sx={{ pl: 6, py: 1 }}>
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="text" width="40%" />
      </Box>
    );
  }

  if (query.error && variants.length === 0) {
    return (
      <Box sx={{ pl: 6, py: 1 }}>
        <LoadError what="Variants" error={query.error} />
      </Box>
    );
  }

  return (
    <>
      {variants.map((feat, i) => {
        const isNew = i >= previousItemCount;
        return (
          <OptionTooltip
            key={feat.id}
            description={feat.description}
            requirementTree={!feat.eligible ? feat.requirementTree : undefined}
          >
            <Box component="span" sx={[{ display: "block" }, isNew && fadeInUpSx(i - previousItemCount)]}>
              <ListItemButton
                sx={{ pl: 6 }}
                disabled={!feat.eligible}
                onClick={() => {
                  onSelectedFeatsChange({
                    ...selectedFeats,
                    [selectedAptitude]: [
                      ...(selectedFeats[selectedAptitude] || []),
                      {
                        id: feat.id,
                        name: feat.name,
                        description: feat.description ?? undefined,
                        aptitudeModifiers: feat.aptitudeModifiers,
                      },
                    ],
                  });
                }}
              >
                <ListItemText primary={feat.name} />
              </ListItemButton>
            </Box>
          </OptionTooltip>
        );
      })}
      {query.hasNextPage && (
        <Box sx={{ pl: 6, py: 0.5 }}>
          <Button size="small" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            <DiceSpinner size="small" loading={query.isFetchingNextPage}>
              Load More
            </DiceSpinner>
          </Button>
        </Box>
      )}
    </>
  );
}

export function LevelUpFeatsStep({ wizard, characterId }: LevelUpFeatsStepProps) {
  const {
    featData,
    isLoadingFeats,
    featsError,
    adjustedFeatPools,
    control,
    selectedFeats,
    selectedAptitude,
    setSelectedAptitude,
    groupedFeats,
    isLoadingAvailableFeats,
    availableFeatsError,
    isFetchingNextFeatsPage,
    expandedFeatFamilies,
    toggleFeatFamily,
    featPicker,
    featSearch,
    setFeatSearch,
    handleFeatsScroll,
  } = wizard;
  // Changed from the picks as they fit the pools, which the wizard reads
  const { field: feats } = useController({ control, name: "selectedFeats" });
  if (isLoadingFeats) return <DiceSpinner />;
  if (featsError && !featData) return <LoadError what="Feats" error={featsError} />;
  if (!featData) return null;

  const aptitudePools: AptitudePool[] = Object.values(adjustedFeatPools);

  const hasSelectableFeats = aptitudePools.some((pool) => pool.available > 0);

  if (!hasSelectableFeats && featData.autoGrantedFeats.length === 0)
    return <BlankNote>No feats to select at this level.</BlankNote>;

  return (
    <Stack spacing={3} sx={{ flex: 1, minHeight: 0 }}>
      <Stack spacing={1} sx={{ flexShrink: 0 }}>
        <SubsectionTitle>Select Feats by Aptitude</SubsectionTitle>

        <Stack spacing={1}>
          {featData.autoGrantedFeats.length > 0 && (
            <AutoGrantedFeats feats={featData.autoGrantedFeats} defaultCollapsed={hasSelectableFeats} />
          )}

          {aptitudePools.some((pool) => pool.available > 0) && (
            <Stack spacing={0.5}>
              <Typography variant="subtitle1" component="p">
                Choose an aptitude to select feats from:
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                {aptitudePools
                  .filter((pool) => pool.available > 0)
                  .map((pool) => {
                    const currentPoolFeats = selectedFeats[pool.id] || [];
                    const isSelected = selectedAptitude === pool.id;

                    return (
                      <ChoiceChip
                        key={pool.id}
                        label={`${pool.name} ${currentPoolFeats.length}/${pool.available}${pool.shared ? " (optional)" : ""}`}
                        selected={isSelected}
                        onClick={() => {
                          if (isSelected) return;
                          // A search typed for the last pool would filter this one.
                          setSelectedAptitude(pool.id);
                          setFeatSearch("");
                        }}
                      />
                    );
                  })}
              </Stack>
            </Stack>
          )}
        </Stack>
      </Stack>

      {/* Feat Selection Interface for Selected Aptitude */}
      {selectedAptitude &&
        (() => {
          const currentPool = aptitudePools.find((p) => p.id === selectedAptitude);
          const currentPoolFeats = selectedFeats[selectedAptitude] || [];

          return (
            <Stack spacing={2} sx={{ flex: 1, minHeight: 0 }}>
              {/* Selected Feats (always reserve space) */}
              <Stack spacing={1} sx={{ flexShrink: 0 }}>
                <SubsectionTitle component="h4">
                  Selected {currentPool?.name} Feats ({currentPoolFeats.length}/{currentPool?.available || 0}):
                </SubsectionTitle>
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
                  {currentPoolFeats.length > 0
                    ? currentPoolFeats.map((feat) => (
                        <OptionTooltip key={feat.id} description={feat.description} maxLength={200}>
                          <Chip
                            label={feat.name}
                            onDelete={() => feats.onChange(withoutPick(selectedFeats, selectedAptitude, feat.id))}
                          />
                        </OptionTooltip>
                      ))
                    : Array.from({ length: currentPool?.available || 0 }, (_, i) => (
                        <Skeleton key={i} variant="rounded" width={100} height={32} />
                      ))}
                </Stack>
              </Stack>

              {/* Add Feat List (Grouped) */}
              {currentPoolFeats.length < (currentPool?.available || 0) && (
                <Stack spacing={1} sx={{ flex: 1, minHeight: 0 }}>
                  <TextField
                    label={`Search ${currentPool?.name} Feats`}
                    placeholder="Search feats…"
                    value={featSearch}
                    onChange={(e) => setFeatSearch(e.target.value)}
                    fullWidth
                    sx={{ flexShrink: 0 }}
                  />
                  {isLoadingAvailableFeats && groupedFeats.length === 0 ? (
                    <DiceSpinner />
                  ) : availableFeatsError && groupedFeats.length === 0 ? (
                    <LoadError what="Feats" error={availableFeatsError} />
                  ) : groupedFeats.length === 0 && featSearch ? (
                    <BlankNote>Nothing matches "{featSearch}". Try another search.</BlankNote>
                  ) : (
                    <List dense sx={{ flex: 1, minHeight: 0, overflow: "auto" }} onScroll={handleFeatsScroll}>
                      {groupedFeats.map((row) => {
                        const family = row.variantCount > 1 ? row.family : null;
                        const isExpanded = family !== null && expandedFeatFamilies.has(family);

                        if (family !== null) {
                          return (
                            <Box key={row.family}>
                              <ListItemButton
                                onClick={() => toggleFeatFamily(family)}
                                aria-expanded={isExpanded}
                                sx={{ gap: 0.5 }}
                              >
                                <ExpandArrow open={isExpanded} />
                                <ListItemText
                                  primary={row.displayName}
                                  secondary={formatCount(row.variantCount, "variant")}
                                />
                              </ListItemButton>
                              {isExpanded && (
                                <FeatFamilyExpansion
                                  characterId={characterId}
                                  aptitudeId={selectedAptitude}
                                  family={family}
                                  picker={featPicker}
                                  selectedAptitude={selectedAptitude}
                                  selectedFeats={selectedFeats}
                                  onSelectedFeatsChange={feats.onChange}
                                />
                              )}
                            </Box>
                          );
                        }

                        // Non-family row — select directly. No client-side
                        // dedup against previously-picked ids; the backend
                        // already excludes non-stackable picked feats from
                        // the response, and stackable feats (e.g. Advance
                        // Wizard Spellcasting on multi-level Archmage)
                        // should remain pickable across batch levels.
                        return (
                          <OptionTooltip
                            key={row.representativeId}
                            description={row.description}
                            requirementTree={!row.eligible ? row.requirementTree : undefined}
                          >
                            <span>
                              <ListItemButton
                                disabled={!row.eligible}
                                onClick={() => {
                                  feats.onChange({
                                    ...selectedFeats,
                                    [selectedAptitude]: [
                                      ...(selectedFeats[selectedAptitude] || []),
                                      {
                                        id: row.representativeId,
                                        name: row.displayName,
                                        description: row.description,
                                        aptitudeModifiers: row.aptitudeModifiers,
                                      },
                                    ],
                                  });
                                }}
                              >
                                <ListItemText primary={row.displayName} />
                              </ListItemButton>
                            </span>
                          </OptionTooltip>
                        );
                      })}
                      <NextPageSpinner loading={isFetchingNextFeatsPage} />
                    </List>
                  )}
                </Stack>
              )}
            </Stack>
          );
        })()}
    </Stack>
  );
}
