import { useListboxQuery } from "@/client/src/hooks/index.ts";
import {
  availableFeatsGroupedQuery,
  availablePowersQuery,
  type PickerLevel,
  type PowerPickerLevel,
} from "@/client/src/pages/characters/details/components/levelUp/index.ts";

/** A level wizard's pickers, as the generic wizards give them: the open pool, the search, and the level they're at. */
interface PickerState {
  debouncedFeatSearch: string;
  debouncedPowerSearch: string;
  /** The level the next feat pick lands on, and what the feats are checked against */
  featPicker: PickerLevel;
  /** The level the next spell pick lands on, what the spells are checked against, and those picked already */
  powerPicker: PowerPickerLevel;
  /** The feat pool open, while it has room */
  selectedAptitude: string | null;
  selectedPowerAptitude: string | null;
  selectedPowerLevel: number | null;
  stepName: string;
}

interface PickOptionsParams {
  characterId: string;
  open: boolean;
  wizard: PickerState;
}

/**
 * The options 3.5's Feats and Spells steps list, Add Level's and Edit Level's alike: the open pool's feats (a family's
 * variants in one row) and spells, searched, at the level the wizard's next pick lands on; each asked while its step
 * shows.
 */
export function usePickOptions({ characterId, open, wizard }: PickOptionsParams) {
  const {
    debouncedFeatSearch,
    debouncedPowerSearch,
    featPicker,
    powerPicker,
    selectedAptitude,
    selectedPowerAptitude,
    selectedPowerLevel,
    stepName,
  } = wizard;

  const {
    items: groupedFeats,
    isLoading: isLoadingAvailableFeats,
    error: availableFeatsError,
    onScroll: handleFeatsScroll,
    isFetchingNextPage: isFetchingNextFeatsPage,
  } = useListboxQuery({
    ...availableFeatsGroupedQuery(characterId, selectedAptitude, debouncedFeatSearch, featPicker),
    enabled: open && stepName === "feats",
  });

  const {
    items: availablePowers,
    isLoading: isLoadingAvailablePowers,
    error: availablePowersError,
    onScroll: handlePowersScroll,
    isFetchingNextPage: isFetchingNextPowersPage,
  } = useListboxQuery({
    ...availablePowersQuery(characterId, selectedPowerAptitude, selectedPowerLevel, debouncedPowerSearch, powerPicker),
    enabled: open && stepName === "powers",
  });

  return {
    availableFeatsError,
    availablePowers,
    availablePowersError,
    groupedFeats,
    handleFeatsScroll,
    handlePowersScroll,
    isFetchingNextFeatsPage,
    isFetchingNextPowersPage,
    isLoadingAvailableFeats,
    isLoadingAvailablePowers,
  };
}
