import {
  Alert,
  Box,
  Chip,
  List,
  ListItemButton,
  ListItemText,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useController } from "react-hook-form";

import {
  ChoiceChip,
  DiceSpinner,
  LoadError,
  NextPageSpinner,
  NoMatchesState,
} from "@/client/src/components/common/index.ts";

import { type PowerAptitudePool, withoutPick } from "./levelUp/index.ts";
import type { LevelUpPowersStepProps } from "./levelUpFactory.ts";
import { OptionTooltip } from "./OptionTooltip.tsx";

export function LevelUpSpellsStep({ wizard }: LevelUpPowersStepProps) {
  const {
    powerData,
    isLoadingPowers,
    powersError,
    control,
    selectedFeats,
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
  if (powersError) return <LoadError what="Spells" error={powersError} />;
  if (!powerData) return null;

  const getPowerPoolAvailable = (pool: PowerAptitudePool) => {
    const featsInPool = (selectedFeats[pool.id] || []).length;
    return Math.max(0, pool.available - featsInPool);
  };

  const getLevelPoolAvailable = (pool: PowerAptitudePool, level: string) => pool.levels?.[level]?.available ?? 0;

  const openPool = (aptitudeId: string, level: number | null) => {
    if (aptitudeId === selectedPowerAptitude && level === selectedPowerLevel) return;
    setSelectedPowerAptitude(aptitudeId);
    setSelectedPowerLevel(level);
    // A search typed for the last pool would filter this one.
    setPowerSearch("");
  };

  const powerAptitudePools: PowerAptitudePool[] = powerData.aptitudePools ? Object.values(powerData.aptitudePools) : [];

  const autoGrantedFree = powerData.autoGrantedPowers.filter((p) => p.free);
  const autoGrantedNonFree = powerData.autoGrantedPowers.filter((p) => !p.free);
  const totalPowersToSelect = Object.values(powerData.aptitudePools ?? {}).reduce(
    (sum, pool) => sum + getPowerPoolAvailable(pool),
    0,
  );

  if (totalPowersToSelect === 0 && autoGrantedFree.length === 0 && autoGrantedNonFree.length === 0)
    return <Alert severity="info">No spells to select at this level.</Alert>;

  return (
    <Stack spacing={3} sx={{ flex: 1, minHeight: 0 }}>
      <Box sx={{ flexShrink: 0 }}>
        <Typography variant="h6" component="h3" gutterBottom>
          Select Spells by Aptitude
        </Typography>

        <Stack spacing={1}>
          {autoGrantedFree.length > 0 && (
            <Stack spacing={0.5}>
              <Typography variant="subtitle1" component="h4">
                Auto-Granted Class Abilities
              </Typography>
              <List dense>
                {autoGrantedFree.map((power) => (
                  <ListItemText key={power.id} primary={power.name} />
                ))}
              </List>
            </Stack>
          )}

          {autoGrantedNonFree.length > 0 && (
            <Stack spacing={0.5}>
              <Typography variant="subtitle1" component="h4">
                Auto-Granted Spells
              </Typography>
              <List dense>
                {autoGrantedNonFree.map((power) => (
                  <ListItemText key={power.id} primary={power.name} />
                ))}
              </List>
            </Stack>
          )}

          {totalPowersToSelect > 0 && (
            <Stack spacing={0.5}>
              <Typography variant="subtitle1" component="p">
                Choose an aptitude to select spells from:
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                {powerAptitudePools
                  .filter((pool) => getPowerPoolAvailable(pool) > 0)
                  .flatMap((pool) => {
                    const poolTyped = pool;

                    // Leveled pool: render one chip per spell level with available > 0
                    if (poolTyped.leveled && poolTyped.levels) {
                      return Object.entries(poolTyped.levels)
                        .filter(([level]) => getLevelPoolAvailable(poolTyped, level) > 0)
                        .map(([level]) => {
                          const levelAvailable = getLevelPoolAvailable(poolTyped, level);
                          const powersInLevel = (selectedPowers[pool.id] || []).filter(
                            (p) => p.powerLevel === Number(level),
                          ).length;
                          const isSelected = selectedPowerAptitude === pool.id && selectedPowerLevel === Number(level);
                          const levelLabel = level === "0" ? "Cantrips" : `Level ${level}`;

                          return (
                            <ChoiceChip
                              key={`${pool.id}-${level}`}
                              label={`${pool.name} - ${levelLabel} ${powersInLevel}/${levelAvailable}`}
                              selected={isSelected}
                              onClick={() => openPool(pool.id, Number(level))}
                            />
                          );
                        });
                    }

                    // Non-leveled pool: render single chip
                    const currentPoolPowers = selectedPowers[pool.id] || [];
                    const poolAvailable = getPowerPoolAvailable(poolTyped);
                    const isSelected = selectedPowerAptitude === pool.id && selectedPowerLevel === null;

                    return [
                      <ChoiceChip
                        key={pool.id}
                        label={`${pool.name} ${currentPoolPowers.length}/${poolAvailable}`}
                        selected={isSelected}
                        onClick={() => openPool(pool.id, null)}
                      />,
                    ];
                  })}
              </Stack>
            </Stack>
          )}
        </Stack>
      </Box>
      {/* Spell Selection Interface for Selected Aptitude */}
      {selectedPowerAptitude &&
        (() => {
          const currentPool = powerAptitudePools.find((p) => p.id === selectedPowerAptitude);
          if (!currentPool) return null;

          const isLeveled = currentPool.leveled;
          const currentPoolPowers = selectedPowers[selectedPowerAptitude] || [];
          const allSelectedPowerIds = Object.values(selectedPowers)
            .flat()
            .map((p) => p.id);
          const pickablePowers = availablePowers.filter((opt) => !allSelectedPowerIds.includes(opt.id));

          // For leveled pools, scope to selected power level
          const levelPowers =
            isLeveled && selectedPowerLevel != null
              ? currentPoolPowers.filter((p) => p.powerLevel === selectedPowerLevel)
              : currentPoolPowers;
          const poolAvailable =
            isLeveled && selectedPowerLevel != null
              ? getLevelPoolAvailable(currentPool, String(selectedPowerLevel))
              : getPowerPoolAvailable(currentPool);

          const levelLabel =
            selectedPowerLevel != null ? (selectedPowerLevel === 0 ? "Cantrip" : `Level ${selectedPowerLevel}`) : "";

          return (
            <Stack spacing={2} sx={{ flex: 1, minHeight: 0 }}>
              {/* Selected Spells (always reserve space) */}
              <Stack spacing={1} sx={{ flexShrink: 0 }}>
                <Typography variant="subtitle2" component="h4">
                  Selected {currentPool?.name}
                  {levelLabel ? ` ${levelLabel}` : ""} Spells ({levelPowers.length}/{poolAvailable}):
                </Typography>
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
                  {levelPowers.length > 0
                    ? levelPowers.map((power) => (
                        <OptionTooltip key={power.id} description={power.description} maxLength={200}>
                          <Chip
                            label={power.name}
                            onDelete={() =>
                              powers.onChange(withoutPick(selectedPowers, selectedPowerAptitude, power.id))
                            }
                          />
                        </OptionTooltip>
                      ))
                    : Array.from({ length: poolAvailable }, (_, i) => (
                        <Skeleton key={i} variant="rounded" width={100} height={32} />
                      ))}
                </Stack>
              </Stack>

              {/* Add Spell List */}
              {levelPowers.length < poolAvailable && (
                <Stack spacing={1} sx={{ flex: 1, minHeight: 0 }}>
                  <TextField
                    label={`Search ${currentPool?.name}${levelLabel ? ` ${levelLabel}` : ""} Spells`}
                    placeholder="Search spells…"
                    value={powerSearch}
                    onChange={(e) => setPowerSearch(e.target.value)}
                    fullWidth
                    sx={{ flexShrink: 0 }}
                  />
                  {isLoadingAvailablePowers && availablePowers.length === 0 ? (
                    <DiceSpinner />
                  ) : availablePowersError && availablePowers.length === 0 ? (
                    <LoadError what="Spells" error={availablePowersError} />
                  ) : pickablePowers.length === 0 && powerSearch ? (
                    <NoMatchesState search={powerSearch} />
                  ) : (
                    <List dense sx={{ flex: 1, minHeight: 0, overflow: "auto" }} onScroll={handlePowersScroll}>
                      {pickablePowers.map((power) => (
                        <OptionTooltip key={power.id} description={power.description}>
                          <span>
                            <ListItemButton
                              disabled={!power.eligible}
                              onClick={() => {
                                powers.onChange({
                                  ...selectedPowers,
                                  [selectedPowerAptitude]: [
                                    ...(selectedPowers[selectedPowerAptitude] || []),
                                    {
                                      id: power.id,
                                      name: power.name,
                                      ...(power.description && { description: power.description }),
                                      ...(selectedPowerLevel != null && { powerLevel: selectedPowerLevel }),
                                    },
                                  ],
                                });
                              }}
                            >
                              <ListItemText primary={power.name} />
                            </ListItemButton>
                          </span>
                        </OptionTooltip>
                      ))}
                      <NextPageSpinner loading={isFetchingNextPowersPage} />
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
