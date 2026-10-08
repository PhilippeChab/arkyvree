import { Box, ListItemButton, ListItemText } from "@mui/material";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { type UIEvent } from "react";
import { type Control, useController } from "react-hook-form";

import {
  BlankNote,
  DiceSpinner,
  ExpandArrow,
  LoadError,
  LoadMoreButton,
} from "@/client/src/components/common/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { itemsBeforeLastPage, pageItems } from "@/client/src/lib/pageItems.ts";

import { AutoGrantedPicks } from "./AutoGrantedPicks.tsx";
import {
  type AptitudePool,
  availableFeatFamilyQuery,
  type FeatsData,
  type GroupedFeatRow,
  type LevelUpFormData,
  type PickerLevel,
  type SelectedFeat,
  withoutPick,
  withPick,
} from "./levelUp/index.ts";
import { PickOption, PoolPicker } from "./PoolPicker.tsx";

interface FeatFamilyExpansionProps {
  aptitudeId: string;
  characterId: string;
  family: string;
  /** Picks a variant into the open pool. */
  onPick: (feat: SelectedFeat) => void;
  /** The level the family's row is checked at, so its variants are checked at it too. */
  picker: PickerLevel;
}

/** The feat picker state a level wizard hands the Feats step. */
interface FeatPickerState {
  adjustedFeatPools: Record<string, AptitudePool>;
  /** Why the feats to pick didn't load. */
  availableFeatsError: unknown;
  /** The picks' form: the feats field, which the step changes from `selectedFeats`. */
  control: Control<LevelUpFormData>;
  expandedFeatFamilies: ReadonlySet<string>;
  featData: FeatsData | null | undefined;
  /**
   * The level the next pick lands on, and what it's checked against: the feat list's, which a family's variants are
   * checked at too.
   */
  featPicker: PickerLevel;
  featSearch: string;
  featsError: Error | null;
  groupedFeats: GroupedFeatRow[];
  handleFeatsScroll: (event: UIEvent<HTMLElement>) => void;
  isFetchingNextFeatsPage: boolean;
  isLoadingAvailableFeats: boolean;
  isLoadingFeats: boolean;
  selectedAptitude: string | null;
  selectedFeats: Record<string, SelectedFeat[]>;
  setFeatSearch: (search: string) => void;
  setSelectedAptitude: (aptitude: string | null) => void;
  toggleFeatFamily: (family: string) => void;
}

export interface FeatsStepProps {
  characterId: string;
  wizard: FeatPickerState;
}

function FeatFamilyExpansion({ characterId, aptitudeId, family, picker, onPick }: FeatFamilyExpansionProps) {
  const query = useInfiniteQuery({
    ...availableFeatFamilyQuery(characterId, aptitudeId, family, picker),
    placeholderData: keepPreviousData,
  });

  const variants = pageItems(query.data);
  const previousItemCount = itemsBeforeLastPage(query.data);

  if (query.isLoading) return <DiceSpinner sx={{ py: 4 }} />;

  if (query.error && variants.length === 0) {
    return (
      <Box sx={{ pl: 6, py: 1 }}>
        <LoadError what="Variants" error={query.error} />
      </Box>
    );
  }

  return (
    <>
      {variants.map((feat, i) => (
        <PickOption
          key={feat.id}
          name={feat.name}
          description={feat.description}
          requirementTree={feat.requirementTree}
          disabled={!feat.eligible}
          onPick={() =>
            onPick({
              id: feat.id,
              name: feat.name,
              description: feat.description ?? undefined,
              aptitudeModifiers: feat.aptitudeModifiers,
            })
          }
          indented
          enterIndex={i >= previousItemCount ? i - previousItemCount : undefined}
        />
      ))}
      <LoadMoreButton
        hasNextPage={!!query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        onClick={() => query.fetchNextPage()}
      />
    </>
  );
}

export function FeatsStep({ wizard, characterId }: FeatsStepProps) {
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

  const openPools = Object.values(adjustedFeatPools).filter((pool) => pool.available > 0);
  if (openPools.length === 0 && featData.autoGrantedFeats.length === 0)
    return <BlankNote>No feats to select at this level</BlankNote>;

  const currentPool = openPools.find((pool) => pool.id === selectedAptitude);
  const pick = (aptitudeId: string, feat: SelectedFeat) => feats.onChange(withPick(selectedFeats, aptitudeId, feat));

  return (
    <PoolPicker
      what="Feats"
      granted={
        featData.autoGrantedFeats.length > 0 && (
          <AutoGrantedPicks what="Feats" picks={featData.autoGrantedFeats} defaultCollapsed={openPools.length > 0} />
        )
      }
      pools={openPools.map((pool) => ({
        key: pool.id,
        label: `${pool.name} ${(selectedFeats[pool.id] ?? []).length}/${pool.available}${pool.shared ? " (optional)" : ""}`,
        open: pool.id === selectedAptitude,
        onOpen: () => setSelectedAptitude(pool.id),
      }))}
      open={
        currentPool && {
          name: currentPool.name,
          picks: selectedFeats[currentPool.id] ?? [],
          room: currentPool.available,
          onRemove: (id) => feats.onChange(withoutPick(selectedFeats, currentPool.id, id)),
        }
      }
      search={featSearch}
      onSearch={setFeatSearch}
      options={{
        count: groupedFeats.length,
        error: availableFeatsError,
        fetchingNextPage: isFetchingNextFeatsPage,
        loading: isLoadingAvailableFeats,
        onScroll: handleFeatsScroll,
      }}
    >
      {currentPool &&
        groupedFeats.map((row) => {
          const family = row.variantCount > 1 ? row.family : null;
          if (family !== null) {
            const isExpanded = expandedFeatFamilies.has(family);
            return (
              <Box key={row.family}>
                <ListItemButton onClick={() => toggleFeatFamily(family)} aria-expanded={isExpanded} sx={{ gap: 0.5 }}>
                  <ExpandArrow open={isExpanded} />
                  <ListItemText primary={row.displayName} secondary={formatCount(row.variantCount, "variant")} />
                </ListItemButton>
                {isExpanded && (
                  <FeatFamilyExpansion
                    characterId={characterId}
                    aptitudeId={currentPool.id}
                    family={family}
                    picker={featPicker}
                    onPick={(feat) => pick(currentPool.id, feat)}
                  />
                )}
              </Box>
            );
          }
          // A feat picked already stays listed: the server leaves out what can't be picked twice, and a stackable
          // feat (Advance Wizard Spellcasting at several Archmage levels) may be picked again
          return (
            <PickOption
              key={row.representativeId}
              name={row.displayName}
              description={row.description}
              requirementTree={row.requirementTree}
              disabled={!row.eligible}
              onPick={() =>
                pick(currentPool.id, {
                  id: row.representativeId,
                  name: row.displayName,
                  description: row.description,
                  aptitudeModifiers: row.aptitudeModifiers,
                })
              }
            />
          );
        })}
    </PoolPicker>
  );
}
