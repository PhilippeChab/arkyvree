import { Box, Collapse, List, ListItemButton, ListItemText, Skeleton, Stack, Tooltip, Typography } from "@mui/material";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useController } from "react-hook-form";

import {
  BlankState,
  ChoiceChip,
  CLICKABLE_SX,
  DiceSpinner,
  ExpandArrow,
  LoadError,
  LoadMoreButton,
  NextPageSpinner,
  NoMatchesState,
  SearchField,
  TagChip,
  toggleProps,
} from "@/client/src/components/common/index.ts";
import { FeatsIcon } from "@/client/src/components/icons/index.ts";
import { fadeInUpSx } from "@/client/src/lib/animations.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

import { type AptitudePool, type FeatsData, type SelectedFeat, withoutPick } from "./levelUp/index.ts";
import type { LevelUpFeatsStepProps } from "./levelUpFactory.ts";

interface AutoGrantedFeatsProps {
  feats: FeatsData["autoGrantedFeats"];
  defaultCollapsed: boolean;
}

interface FeatFamilyExpansionProps {
  characterId: string;
  aptitudeId: string;
  klassId: string;
  klassLevel: number;
  family: string;
  editingLevelId?: string;
  allSelectedFeatPickString?: string;
  pendingLevelKlassLevelIds?: string;
  pendingLevelFeatPicks?: string;
  selectedAptitude: string;
  selectedFeats: Record<string, SelectedFeat[]>;
  onSelectedFeatsChange: (value: Record<string, SelectedFeat[]>) => void;
}

function AutoGrantedFeats({ feats, defaultCollapsed }: AutoGrantedFeatsProps) {
  const [open, setOpen] = useState(!defaultCollapsed);
  return (
    <Box sx={{ mb: 1 }}>
      <Stack
        {...toggleProps(open, () => setOpen(!open))}
        direction="row"
        sx={{ alignItems: "center", ...CLICKABLE_SX }}
      >
        <Typography variant="subtitle1" sx={{ flex: 1 }}>
          Auto-Granted Feats ({feats.length})
        </Typography>
        <ExpandArrow open={open} />
      </Stack>
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
  klassId,
  klassLevel,
  family,
  editingLevelId,
  allSelectedFeatPickString,
  pendingLevelKlassLevelIds,
  pendingLevelFeatPicks,
  selectedAptitude,
  selectedFeats,
  onSelectedFeatsChange,
}: FeatFamilyExpansionProps) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.characters.levelUp.availableFeatFamily(
      characterId,
      aptitudeId,
      family,
      klassId,
      editingLevelId,
      allSelectedFeatPickString,
      pendingLevelKlassLevelIds,
    ),
    queryFn: async ({ pageParam }) => {
      return parseResponse(
        rpc.api.characters.levels[":characterId"]["available-feats"]["$get"]({
          param: { characterId },
          query: {
            aptitudeId,
            classId: klassId,
            level: klassLevel.toString(),
            limit: "50",
            page: pageParam.toString(),
            family,
            characterLevelId: editingLevelId || undefined,
            selectedFeatPicks: allSelectedFeatPickString || undefined,
            pendingLevelClassLevelIds: pendingLevelKlassLevelIds || undefined,
            pendingLevelFeatPicks: pendingLevelFeatPicks || undefined,
          },
        }),
      );
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    placeholderData: keepPreviousData,
  });

  const variants = pageItems(query.data);
  const pages = query.data?.pages ?? [];
  const previousItemCount = pages.slice(0, -1).reduce((sum, p) => sum + p.items.length, 0);

  if (query.isLoading) {
    return (
      <Box sx={{ pl: 6, py: 1 }}>
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="text" width="40%" />
      </Box>
    );
  }

  return (
    <>
      {variants.map((feat, i) => {
        const isNew = i >= previousItemCount;
        return (
          <Tooltip
            describeChild
            key={feat.id}
            title={!feat.eligible && feat.requirementTree ? feat.requirementTree : (feat.description ?? "")}
            placement="right"
            slotProps={{
              tooltip: {
                sx:
                  !feat.eligible && feat.requirementTree
                    ? { maxWidth: "none", whiteSpace: "pre", fontFamily: "monospace" }
                    : {},
              },
            }}
          >
            <Box component="span" sx={{ display: "block", ...(isNew ? fadeInUpSx(i - previousItemCount) : undefined) }}>
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
          </Tooltip>
        );
      })}
      <LoadMoreButton
        size="small"
        hasNextPage={query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        onClick={() => query.fetchNextPage()}
      />
    </>
  );
}

export function LevelUpFeatsStep({
  wizard,
  characterId,
  klassId,
  klassLevel,
  editingLevelId,
  pendingLevelKlassLevelIds,
  pendingLevelFeatPicks,
}: LevelUpFeatsStepProps) {
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
    isFetchingNextFeatsPage,
    expandedFeatFamilies,
    toggleFeatFamily,
    allSelectedFeatPickString,
    featSearch,
    setFeatSearch,
    handleFeatsScroll,
  } = wizard;
  // Changed from the picks as they fit the pools, which the wizard reads
  const { field: feats } = useController({ control, name: "selectedFeats" });
  if (isLoadingFeats) return <DiceSpinner />;
  if (featsError) return <LoadError what="Feats" error={featsError} />;
  if (!featData) return null;

  const aptitudePools: AptitudePool[] = Object.values(adjustedFeatPools);

  const hasSelectableFeats = aptitudePools.some((pool) => pool.available > 0);

  if (!hasSelectableFeats && featData.autoGrantedFeats.length === 0) {
    return <BlankState icon={FeatsIcon} title="No feats to select at this level" />;
  }

  return (
    <Stack sx={{ flex: 1, minHeight: 0 }}>
      <Box sx={{ flexShrink: 0 }}>
        <Typography component="h3" variant="h6" gutterBottom>
          Select Feats by Aptitude
        </Typography>

        {featData.autoGrantedFeats.length > 0 && (
          <AutoGrantedFeats feats={featData.autoGrantedFeats} defaultCollapsed={hasSelectableFeats} />
        )}

        {aptitudePools.some((pool) => pool.available > 0) && (
          <>
            <Typography variant="subtitle1" gutterBottom>
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
          </>
        )}
      </Box>

      {/* Feat Selection Interface for Selected Aptitude */}
      {selectedAptitude &&
        (() => {
          const currentPool = aptitudePools.find((p) => p.id === selectedAptitude);
          const currentPoolFeats = selectedFeats[selectedAptitude] || [];

          return (
            <Stack sx={{ mt: 3, flex: 1, minHeight: 0 }}>
              {/* Selected Feats (always reserve space) */}
              <Box sx={{ flexShrink: 0, mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Selected {currentPool?.name} Feats ({currentPoolFeats.length}/{currentPool?.available || 0}):
                </Typography>
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
                  {currentPoolFeats.length > 0
                    ? currentPoolFeats.map((feat) => (
                        <Tooltip
                          describeChild
                          key={feat.id}
                          title={
                            feat.description
                              ? feat.description.length > 200
                                ? `${feat.description.slice(0, 200)}…`
                                : feat.description
                              : ""
                          }
                          placement="right"
                        >
                          <TagChip
                            tag={{
                              label: feat.name,
                              color: "primary",
                              onDelete: () => feats.onChange(withoutPick(selectedFeats, selectedAptitude, feat.id)),
                            }}
                          />
                        </Tooltip>
                      ))
                    : Array.from({ length: currentPool?.available || 0 }, (_, i) => (
                        <Skeleton key={i} variant="rounded" width={100} height={32} />
                      ))}
                </Stack>
              </Box>

              {/* Add Feat List (Grouped) */}
              {currentPoolFeats.length < (currentPool?.available || 0) && (
                <Stack sx={{ flex: 1, minHeight: 0 }}>
                  <SearchField
                    placeholder={`Search ${currentPool?.name} feats...`}
                    value={featSearch}
                    onChange={setFeatSearch}
                    fullWidth
                    sx={{ mb: 1, flexShrink: 0 }}
                  />
                  {isLoadingAvailableFeats && groupedFeats.length === 0 ? (
                    <DiceSpinner />
                  ) : groupedFeats.length === 0 && featSearch ? (
                    <NoMatchesState search={featSearch} />
                  ) : (
                    <List dense sx={{ flex: 1, minHeight: 0, overflow: "auto" }} onScroll={handleFeatsScroll}>
                      {groupedFeats.map((row) => {
                        const family = row.variantCount > 1 ? row.family : null;
                        const isExpanded = family !== null && expandedFeatFamilies.has(family);

                        if (family !== null) {
                          return (
                            <Box key={row.family}>
                              <ListItemButton onClick={() => toggleFeatFamily(family)} aria-expanded={isExpanded}>
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
                                  klassId={klassId}
                                  klassLevel={klassLevel}
                                  family={family}
                                  editingLevelId={editingLevelId}
                                  allSelectedFeatPickString={allSelectedFeatPickString}
                                  pendingLevelKlassLevelIds={pendingLevelKlassLevelIds}
                                  pendingLevelFeatPicks={pendingLevelFeatPicks}
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
                          <Tooltip
                            describeChild
                            key={row.representativeId}
                            title={
                              !row.eligible && "requirementTree" in row ? String(row.requirementTree) : row.description
                            }
                            placement="right"
                            slotProps={{
                              tooltip: {
                                sx:
                                  !row.eligible && "requirementTree" in row
                                    ? { maxWidth: "none", whiteSpace: "pre", fontFamily: "monospace" }
                                    : {},
                              },
                            }}
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
                          </Tooltip>
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
