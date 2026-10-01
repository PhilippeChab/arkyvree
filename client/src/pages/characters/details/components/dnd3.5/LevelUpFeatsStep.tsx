import { ExpandLess as ExpandLessIcon, ExpandMore as ExpandMoreIcon } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  List,
  ListItemButton,
  ListItemText,
  Skeleton,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";

import { CLICKABLE_SX, clickableProps, DiceSpinner, NoMatchesState } from "@/client/src/components/common/index.ts";
import { fadeInUpSx } from "@/client/src/lib/animations.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

import type { AptitudePool, FeatsData, SelectedFeat } from "./levelUp/index.ts";
import type { LevelUpFeatsStepProps } from "./levelUpFactory.ts";

function AutoGrantedFeats({
  feats,
  defaultCollapsed,
}: {
  feats: FeatsData["autoGrantedFeats"];
  defaultCollapsed: boolean;
}) {
  const [open, setOpen] = useState(!defaultCollapsed);
  return (
    <Box sx={{ mb: 1 }}>
      <Box
        {...clickableProps(() => setOpen(!open))}
        aria-expanded={open}
        sx={{ display: "flex", alignItems: "center", ...CLICKABLE_SX }}
      >
        <Typography variant="subtitle1" sx={{ flex: 1 }}>
          Auto-Granted Feats ({feats.length})
        </Typography>
        {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
      </Box>
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
  setValue,
}: {
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
  setValue: (key: "selectedFeats", value: Record<string, SelectedFeat[]>) => void;
}) {
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
            klassId,
            level: klassLevel.toString(),
            limit: "50",
            page: pageParam.toString(),
            family,
            characterLevelId: editingLevelId || undefined,
            selectedFeatPicks: allSelectedFeatPickString || undefined,
            pendingLevelKlassLevelIds: pendingLevelKlassLevelIds || undefined,
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
            enterDelay={300}
            arrow
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
                  setValue("selectedFeats", {
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
    setValue,
    handleDeleteFeat,
  } = wizard;
  if (isLoadingFeats) return <DiceSpinner />;
  if (featsError) return <Alert severity="error">Error loading feats.</Alert>;
  if (!featData) return null;

  const aptitudePools: AptitudePool[] = Object.values(adjustedFeatPools);

  const hasSelectableFeats = aptitudePools.some((pool) => pool.available > 0);

  if (!hasSelectableFeats && featData.autoGrantedFeats.length === 0) {
    return <Alert severity="info">No feats to select at this level.</Alert>;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <Box sx={{ flexShrink: 0 }}>
        <Typography variant="h6" gutterBottom>
          Select Feats by Aptitude
        </Typography>

        {featData.autoGrantedFeats.length > 0 && (
          <AutoGrantedFeats feats={featData.autoGrantedFeats} defaultCollapsed={hasSelectableFeats} />
        )}

        {aptitudePools.some((pool) => pool.available > 0) && (
          <>
            <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
              Choose an aptitude to select feats from:
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {aptitudePools
                .filter((pool) => pool.available > 0)
                .map((pool) => {
                  const currentPoolFeats = selectedFeats[pool.id] || [];
                  const isSelected = selectedAptitude === pool.id;

                  return (
                    <Chip
                      key={pool.id}
                      label={`${pool.name} ${currentPoolFeats.length}/${pool.available}${pool.shared ? " (optional)" : ""}`}
                      variant={isSelected ? "filled" : "outlined"}
                      color={isSelected ? "primary" : "default"}
                      onClick={() => {
                        if (isSelected) return;
                        // A search typed for the last pool would filter this one.
                        setSelectedAptitude(pool.id);
                        setFeatSearch("");
                      }}
                    />
                  );
                })}
            </Box>
          </>
        )}
      </Box>

      {/* Feat Selection Interface for Selected Aptitude */}
      {selectedAptitude &&
        (() => {
          const currentPool = aptitudePools.find((p) => p.id === selectedAptitude);
          const currentPoolFeats = selectedFeats[selectedAptitude] || [];

          return (
            <Box sx={{ display: "flex", flexDirection: "column", mt: 3, flex: 1, minHeight: 0 }}>
              {/* Selected Feats (always reserve space) */}
              <Box sx={{ flexShrink: 0, mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Selected {currentPool?.name} Feats ({currentPoolFeats.length}/{currentPool?.available || 0}):
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
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
                          enterDelay={300}
                          arrow
                        >
                          <Chip label={feat.name} onDelete={() => handleDeleteFeat(feat.id, selectedAptitude)} />
                        </Tooltip>
                      ))
                    : Array.from({ length: currentPool?.available || 0 }, (_, i) => (
                        <Skeleton key={i} variant="rounded" width={100} height={32} />
                      ))}
                </Box>
              </Box>

              {/* Add Feat List (Grouped) */}
              {currentPoolFeats.length < (currentPool?.available || 0) && (
                <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                  <TextField
                    label={`Search ${currentPool?.name} Feats`}
                    placeholder="Search feats..."
                    value={featSearch}
                    onChange={(e) => setFeatSearch(e.target.value)}
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
                              <ListItemButton onClick={() => toggleFeatFamily(family)}>
                                {isExpanded ? (
                                  <ExpandLessIcon fontSize="small" sx={{ mr: 1 }} />
                                ) : (
                                  <ExpandMoreIcon fontSize="small" sx={{ mr: 1 }} />
                                )}
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
                                  setValue={setValue}
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
                            enterDelay={300}
                            arrow
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
                                  setValue("selectedFeats", {
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
                      {isFetchingNextFeatsPage && (
                        <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
                          <DiceSpinner size="small" />
                        </Box>
                      )}
                    </List>
                  )}
                </Box>
              )}
            </Box>
          );
        })()}
    </Box>
  );
}
