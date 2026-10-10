import { type UIEvent } from "react";
import { type Control, useController } from "react-hook-form";

import { BlankNote, DiceSpinner, LoadError } from "@/client/src/components/common/index.ts";
import { SPELL_LEVEL_LABELS } from "@/vocabulary/dnd3.5/spells.ts";

import { AutoGrantedPicks } from "./AutoGrantedPicks.tsx";
import {
  type AvailablePower,
  type LevelUpFormData,
  type PowerAptitudePool,
  type PowersData,
  withoutPick,
  withPick,
} from "./levelUp/index.ts";
import { PickOption, PoolPicker } from "./PoolPicker.tsx";

/** The spell picker state a level wizard hands the Spells step: its powers, as the API names them. */
interface SpellPickerState {
  availablePowers: AvailablePower[];
  /** Why the spells to pick didn't load. */
  availablePowersError: unknown;
  /** The picks' form: the spells field, which the step changes from `selectedPowers`. */
  control: Control<LevelUpFormData>;
  handlePowersScroll: (event: UIEvent<HTMLElement>) => void;
  isFetchingNextPowersPage: boolean;
  isLoadingAvailablePowers: boolean;
  isLoadingPowers: boolean;
  powerData: PowersData | null | undefined;
  powerSearch: string;
  powersError: Error | null;
  selectedPowerAptitude: string | null;
  selectedPowerLevel: number | null;
  selectedPowers: LevelUpFormData["selectedPowers"];
  setPowerSearch: (search: string) => void;
  setSelectedPowerAptitude: (aptitude: string | null) => void;
  setSelectedPowerLevel: (level: number | null) => void;
}

export interface SpellsStepProps {
  wizard: SpellPickerState;
}

export function SpellsStep({ wizard }: SpellsStepProps) {
  const {
    powerData,
    isLoadingPowers,
    powersError,
    control,
    selectedPowers,
    selectedPowerAptitude,
    selectedPowerLevel,
    setSelectedPowerAptitude,
    setSelectedPowerLevel,
    availablePowers,
    isLoadingAvailablePowers,
    availablePowersError,
    isFetchingNextPowersPage,
    powerSearch,
    setPowerSearch,
    handlePowersScroll,
  } = wizard;
  // Changed from the picks as they fit the pools, which the wizard reads
  const { field: powers } = useController({ control, name: "selectedPowers" });
  if (isLoadingPowers) return <DiceSpinner />;
  if (powersError && !powerData) return <LoadError what="Spells" error={powersError} />;
  if (!powerData) return null;

  // A pool's room for the spells picked (a shared pool's feats take theirs); a leveled pool's at a spell level
  const poolRoom = (pool: PowerAptitudePool) => Math.max(0, pool.available);
  const levelRoom = (pool: PowerAptitudePool, level: number) => pool.levels?.[level]?.available ?? 0;
  const picksAt = (pool: PowerAptitudePool, level: number | null) =>
    (selectedPowers[pool.id] ?? []).filter((power) => level === null || power.powerLevel === level);
  const roomAt = (pool: PowerAptitudePool, level: number | null) =>
    level === null ? poolRoom(pool) : levelRoom(pool, level);

  const openPools = Object.values(powerData.aptitudePools ?? {}).filter((pool) => poolRoom(pool) > 0);
  // A leveled pool opens one spell level at a time, each a chip of its own
  const pools = openPools.flatMap((pool) =>
    (pool.leveled && pool.levels
      ? Object.keys(pool.levels)
          .map(Number)
          .filter((level) => levelRoom(pool, level) > 0)
      : [null]
    ).map((level) => ({ pool, level })),
  );
  if (pools.length === 0 && powerData.autoGrantedPowers.length === 0)
    return <BlankNote>No spells to select at this level</BlankNote>;

  const currentPool = openPools.find((pool) => pool.id === selectedPowerAptitude);
  const currentLevel = currentPool?.leveled ? selectedPowerLevel : null;

  return (
    <PoolPicker
      what="Spells"
      granted={
        powerData.autoGrantedPowers.length > 0 && (
          <AutoGrantedPicks what="Spells" picks={powerData.autoGrantedPowers} defaultCollapsed={pools.length > 0} />
        )
      }
      pools={pools.map(({ pool, level }) => ({
        key: `${pool.id}-${level}`,
        label: `${pool.name}${level === null ? "" : ` — ${SPELL_LEVEL_LABELS[level]}`} ${picksAt(pool, level).length}/${roomAt(pool, level)}`,
        open: pool.id === selectedPowerAptitude && level === selectedPowerLevel,
        onOpen: () => {
          setSelectedPowerAptitude(pool.id);
          setSelectedPowerLevel(level);
        },
      }))}
      open={
        currentPool && {
          name: currentPool.name,
          level: currentLevel === null ? undefined : SPELL_LEVEL_LABELS[currentLevel],
          picks: picksAt(currentPool, currentLevel),
          room: roomAt(currentPool, currentLevel),
          onRemove: (id) => powers.onChange(withoutPick(selectedPowers, currentPool.id, id)),
        }
      }
      search={powerSearch}
      onSearch={setPowerSearch}
      options={{
        count: availablePowers.length,
        error: availablePowersError,
        fetchingNextPage: isFetchingNextPowersPage,
        loading: isLoadingAvailablePowers,
        onScroll: handlePowersScroll,
      }}
    >
      {currentPool &&
        // The server leaves out what's picked already, in any pool, as it leaves out a feat held
        availablePowers.map((power) => (
          <PickOption
            key={power.id}
            name={power.name}
            description={power.description}
            disabled={!power.eligible}
            onPick={() =>
              powers.onChange(
                withPick(selectedPowers, currentPool.id, {
                  id: power.id,
                  name: power.name,
                  ...(power.description && { description: power.description }),
                  ...(currentLevel !== null && { powerLevel: currentLevel }),
                }),
              )
            }
          />
        ))}
    </PoolPicker>
  );
}
