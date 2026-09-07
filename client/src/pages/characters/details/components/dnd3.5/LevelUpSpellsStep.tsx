import type { LevelUpPowersStepProps } from "./levelUpFactory.ts";
import { DiceSpinner } from "@/client/src/components/common/index.ts";
import {
  Alert,
  Box,
  Chip,
  List,
  ListItemButton,
  ListItemText,
  Skeleton,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";

type PowersData = NonNullable<LevelUpPowersStepProps["powerData"]>;
type PowerAptitudePool = PowersData["aptitudePools"][string];

export function LevelUpSpellsStep({
  powerData,
  isLoadingPowers,
  powersError,
  selectedPowers,
  selectedFeats,
  selectedPowerAptitude,
  selectedPowerLevel,
  setSelectedPowerAptitude,
  setSelectedPowerLevel,
  availablePowers,
  isLoadingAvailablePowers,
  isFetchingNextPowersPage,
  powerSearch,
  setValue,
  handleDeletePower,
  onPowerSearchChange,
  onPowersScroll,
}: LevelUpPowersStepProps) {
  if (isLoadingPowers) return <DiceSpinner />;
  if (powersError) return <Alert severity="error">Error loading spells.</Alert>;
  if (!powerData) return null;

  const getPowerPoolAvailable = (pool: PowerAptitudePool) => {
    const featsInPool = (selectedFeats[pool.id] || []).length;
    return Math.max(0, pool.available - featsInPool);
  };

  const getLevelPoolAvailable = (pool: PowerAptitudePool, level: string) => {
    const levelData = (pool as Record<string, unknown>).levels as
      | Record<string, { available: number }>
      | undefined;
    if (!levelData?.[level]) return 0;
    return levelData[level].available;
  };

  const powerAptitudePools: PowerAptitudePool[] = powerData.aptitudePools
    ? Object.values(powerData.aptitudePools)
    : [];

  const autoGrantedFree = powerData.autoGrantedPowers.filter((p) => p.free);
  const autoGrantedNonFree = powerData.autoGrantedPowers.filter((p) => !p.free);
  const totalPowersToSelect = Object.values(powerData.aptitudePools ?? {}).reduce(
    (sum, pool) => sum + getPowerPoolAvailable(pool as PowerAptitudePool),
    0,
  );

  if (totalPowersToSelect === 0 && autoGrantedFree.length === 0 && autoGrantedNonFree.length === 0) {
    return <Alert severity="info">No spells to select at this level.</Alert>;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <Box sx={{ flexShrink: 0 }}>
        <Typography variant="h6" gutterBottom>
          Select Spells by Aptitude
        </Typography>

        {autoGrantedFree.length > 0 && (
          <Box sx={{
            mb: 1
          }}>
            <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
              Auto-Granted Class Abilities
            </Typography>
            <List dense>
              {autoGrantedFree.map((power) => (
                <ListItemText key={power.id} primary={power.name} />
              ))}
            </List>
          </Box>
        )}

        {autoGrantedNonFree.length > 0 && (
          <Box sx={{
            mb: 1
          }}>
            <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
              Auto-Granted Spells
            </Typography>
            <List dense>
              {autoGrantedNonFree.map((power) => (
                <ListItemText key={power.id} primary={power.name} />
              ))}
            </List>
          </Box>
        )}

        {totalPowersToSelect > 0 && (
          <>
            <Typography variant="subtitle1" sx={{ mb: 0.5 }}>
              Choose an aptitude to select spells from:
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {powerAptitudePools
              .filter((pool) => getPowerPoolAvailable(pool) > 0)
              .flatMap((pool) => {
                const poolTyped = pool as PowerAptitudePool;

                // Leveled pool: render one chip per spell level with available > 0
                if (poolTyped.leveled && poolTyped.levels) {
                  return Object.entries(poolTyped.levels)
                    .filter(([level]) => getLevelPoolAvailable(poolTyped, level) > 0)
                    .map(([level]) => {
                      const levelAvailable = getLevelPoolAvailable(poolTyped, level);
                      const powersInLevel = (selectedPowers[pool.id] || []).filter(
                        (p) => p.powerLevel === Number(level),
                      ).length;
                      const isSelected = selectedPowerAptitude === pool.id
                        && selectedPowerLevel === Number(level);
                      const levelLabel = level === "0" ? "Cantrips" : `Level ${level}`;

                      return (
                        <Chip
                          key={`${pool.id}-${level}`}
                          label={`${pool.name} - ${levelLabel} ${powersInLevel}/${levelAvailable}`}
                          variant={isSelected ? "filled" : "outlined"}
                          color={isSelected ? "primary" : "default"}
                          onClick={() => {
                            setSelectedPowerAptitude(pool.id);
                            setSelectedPowerLevel(Number(level));
                          }}
                        />
                      );
                    });
                }

                // Non-leveled pool: render single chip
                const currentPoolPowers = selectedPowers[pool.id] || [];
                const poolAvailable = getPowerPoolAvailable(poolTyped);
                const isSelected = selectedPowerAptitude === pool.id
                  && selectedPowerLevel === null;

                return [(
                  <Chip
                    key={pool.id}
                    label={`${pool.name} ${currentPoolPowers.length}/${poolAvailable}`}
                    variant={isSelected ? "filled" : "outlined"}
                    color={isSelected ? "primary" : "default"}
                    onClick={() => {
                      setSelectedPowerAptitude(pool.id);
                      setSelectedPowerLevel(null);
                    }}
                  />
                )];
              })}
          </Box>
          </>
        )}
      </Box>
      {/* Spell Selection Interface for Selected Aptitude */}
      {selectedPowerAptitude && (() => {
        const currentPool = powerAptitudePools.find(
          (p) => p.id === selectedPowerAptitude,
        );
        if (!currentPool) return null;

        const isLeveled = (currentPool as PowerAptitudePool).leveled;
        const currentPoolPowers = selectedPowers[selectedPowerAptitude] || [];
        const allSelectedPowerIds = Object.values(selectedPowers).flat().map((p) => p.id);

        // For leveled pools, scope to selected power level
        const levelPowers = isLeveled && selectedPowerLevel != null
          ? currentPoolPowers.filter((p) => p.powerLevel === selectedPowerLevel)
          : currentPoolPowers;
        const poolAvailable = isLeveled && selectedPowerLevel != null
          ? getLevelPoolAvailable(currentPool as PowerAptitudePool, String(selectedPowerLevel))
          : getPowerPoolAvailable(currentPool as PowerAptitudePool);

        const levelLabel = selectedPowerLevel != null
          ? selectedPowerLevel === 0 ? "Cantrip" : `Level ${selectedPowerLevel}`
          : "";

        return (
          <Box sx={{ display: "flex", flexDirection: "column", mt: 3, flex: 1, minHeight: 0 }}>
            {/* Selected Spells (always reserve space) */}
            <Box sx={{ flexShrink: 0, mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Selected {currentPool?.name}{levelLabel ? ` ${levelLabel}` : ""} Spells ({levelPowers.length}/{poolAvailable}):
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {levelPowers.length > 0
                  ? levelPowers.map((power) => (
                      <Tooltip key={power.id} title={power.description ? power.description.length > 200 ? `${power.description.slice(0, 200)}…` : power.description : ""} placement="right" enterDelay={300} arrow>
                        <Chip
                          label={power.name}
                          onDelete={() =>
                            handleDeletePower(power.id, selectedPowerAptitude)}
                        />
                      </Tooltip>
                    ))
                  : Array.from({ length: poolAvailable }, (_, i) => (
                      <Skeleton key={i} variant="rounded" width={100} height={32} />
                    ))
                }
              </Box>
            </Box>

            {/* Add Spell List */}
            {levelPowers.length < poolAvailable && (
              <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                <TextField
                  label={`Search ${currentPool?.name}${levelLabel ? ` ${levelLabel}` : ""} Spells`}
                  placeholder="Search spells..."
                  value={powerSearch}
                  onChange={(e) => onPowerSearchChange(e.target.value)}
                  fullWidth
                  sx={{ mb: 1, flexShrink: 0 }}
                />
                {isLoadingAvailablePowers && availablePowers.length === 0
                  ? <DiceSpinner />
                  : <List
                      dense
                      sx={{ flex: 1, minHeight: 0, overflow: "auto" }}
                      onScroll={onPowersScroll}
                    >
                      {availablePowers
                        .filter((opt) => !allSelectedPowerIds.includes(opt.id))
                        .map((power) => (
                          <Tooltip key={power.id} title={power.description ?? ""} placement="right" enterDelay={300} arrow>
                            <span>
                              <ListItemButton
                                disabled={!power.eligible}
                                onClick={() => {
                                  setValue("selectedPowers", {
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
                          </Tooltip>
                        ))
                      }
                      {isFetchingNextPowersPage && (
                        <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
                          <DiceSpinner size="small" />
                        </Box>
                      )}
                    </List>
                }
              </Box>
            )}

          </Box>
        );
      })()}
    </Box>
  );
}
