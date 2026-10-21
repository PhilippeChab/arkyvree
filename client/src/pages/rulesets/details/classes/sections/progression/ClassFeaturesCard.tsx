import { Autocomplete, Box, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";

import { CardTitle, Panel, ScrollSafeListbox } from "@/client/src/components/common/index.ts";
import { useDebouncedValue } from "@/client/src/hooks/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import { levelFeatLabel } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { useAptitudeOptions } from "@/client/src/pages/rulesets/components/index.ts";
import { useRulesetFeats } from "@/client/src/pages/rulesets/hooks/index.ts";

import { LevelToggles } from "./LevelToggles.tsx";
import { describeFeatureKey, type FeatureRow, type PoolRow } from "./progressionDraft.ts";

interface ClassFeaturesCardProps {
  /** The features the class grants, with the levels the tab holds for each */
  features: readonly FeatureRow[];
  /** The class's levels, by their number */
  levels: readonly { id: string; level: number }[];
  onAddFeature: (row: FeatureRow) => void;
  onAddPool: (pool: PoolRow) => void;
  onFeatureLevels: (row: FeatureRow, levelIds: string[]) => void;
  onPoolPick: (aptitudeId: string, levelId: string, count: number) => void;
  /** The pools the class's levels give picks in, with the picks the tab holds for each */
  pools: readonly PoolRow[];
  readOnly: boolean;
  rulesetId: string;
  /** The features as saved, whose levels a changed toggle is outlined against */
  savedFeatures: readonly FeatureRow[];
  /** The pools as saved */
  savedPools: readonly PoolRow[];
}

/** A row's name, and what it is (a feature's pool, a feat pool). */
interface RowNameProps {
  kind: string;
  name: string;
}

/** A row's name, and what it is, under it. */
function RowName({ name, kind }: RowNameProps) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.3 }}>
        {name}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {kind}
      </Typography>
    </Box>
  );
}

/**
 * A class's features and feat pools by level, on its Progression tab: a row each, whose toggles grant the feature (a
 * feature granted at several levels stacks) or give picks in the pool at a level, a click each; and pickers that add
 * a feature or a pool, granted at no level until one is clicked. Read-only, it only shows them.
 */
export function ClassFeaturesCard({
  features,
  levels,
  onAddFeature,
  onAddPool,
  onFeatureLevels,
  onPoolPick,
  pools,
  readOnly,
  rulesetId,
  savedFeatures,
  savedPools,
}: ClassFeaturesCardProps) {
  const [featSearch, setFeatSearch] = useState("");
  const {
    items: feats,
    isLoading,
    error,
    onScroll,
  } = useRulesetFeats(rulesetId, useDebouncedValue(featSearch), !readOnly);
  const { fetchedOptions: aptitudes, autocompleteProps } = useAptitudeOptions(rulesetId, "feats", !readOnly);
  const featOptions = feats.flatMap((feat) =>
    feat.featsAptitudesInRules.map((fa) => ({
      aptitudeId: fa.aptitudeId,
      aptitudeName: fa.aptitudesInRule?.name ?? null,
      featId: feat.id,
      key: describeFeatureKey({ featId: feat.id, aptitudeId: fa.aptitudeId }),
      levelIds: [],
      name: feat.name,
    })),
  );
  const savedPicks = (aptitudeId: string, levelId: string) =>
    savedPools.find((saved) => saved.aptitudeId === aptitudeId)?.picks[levelId] ?? 0;
  const grid = {
    display: "grid",
    gridTemplateColumns: { xs: "1fr", sm: "200px 1fr" },
    gap: { xs: 0.5, sm: 2 },
    alignItems: "center",
  };

  return (
    <Panel spacing={2}>
      <CardTitle>Class Features and Feat Pools</CardTitle>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        A filled level grants the feature there; a feature granted at several levels stacks. A feat pool&apos;s filled
        level gives a pick in it; click it again for a second pick.
      </Typography>
      <Box sx={{ overflowX: "auto" }}>
        <Stack spacing={0.75} sx={{ minWidth: { sm: 640 } }}>
          {features.map((row) => (
            <Box key={row.key} sx={grid}>
              <RowName name={row.name} kind={row.aptitudeName ?? "Class feature"} />
              <LevelToggles
                label={row.name}
                levels={levels}
                readOnly={readOnly}
                value={(levelId) => (row.levelIds.includes(levelId) ? 1 : 0)}
                saved={(levelId) =>
                  savedFeatures.find((saved) => saved.key === row.key)?.levelIds.includes(levelId) ? 1 : 0
                }
                onToggle={(levelId) =>
                  onFeatureLevels(
                    row,
                    row.levelIds.includes(levelId)
                      ? row.levelIds.filter((id) => id !== levelId)
                      : [...row.levelIds, levelId],
                  )
                }
              />
            </Box>
          ))}
          {pools.map((pool) => (
            <Box key={pool.aptitudeId} sx={grid}>
              <RowName name={pool.name} kind="Feat pool: picks" />
              <LevelToggles
                label={pool.name}
                levels={levels}
                readOnly={readOnly}
                value={(levelId) => pool.picks[levelId] ?? 0}
                saved={(levelId) => savedPicks(pool.aptitudeId, levelId)}
                onToggle={(levelId) => {
                  // A click adds a pick, up to two (or the saved count, when more), then clears the level
                  const count = pool.picks[levelId] ?? 0;
                  const most = Math.max(2, savedPicks(pool.aptitudeId, levelId));
                  onPoolPick(pool.aptitudeId, levelId, count >= most ? 0 : count + 1);
                }}
              />
            </Box>
          ))}
        </Stack>
      </Box>
      {!readOnly && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Autocomplete
            size="small"
            options={featOptions.filter((option) => !features.some((row) => row.key === option.key))}
            getOptionLabel={(option) => levelFeatLabel(option.name, option.aptitudeName)}
            getOptionKey={(option) => option.key}
            value={null}
            onChange={(_, option) => option && onAddFeature(option)}
            onInputChange={(_, input, reason) => {
              if (reason === "input") setFeatSearch(input);
            }}
            filterOptions={(options) => options}
            loading={isLoading}
            noOptionsText={emptyOptionsText("Feats", error)}
            slotProps={{ listbox: { component: ScrollSafeListbox, onScroll } }}
            renderInput={(params) => <TextField {...params} label="Add Class Feature" />}
            sx={{ flex: 1 }}
          />
          <Autocomplete
            {...autocompleteProps}
            size="small"
            options={aptitudes.filter((aptitude) => !pools.some((pool) => pool.aptitudeId === aptitude.id))}
            value={null}
            onChange={(_, aptitude) =>
              aptitude && onAddPool({ aptitudeId: aptitude.id, name: aptitude.name, picks: {} })
            }
            renderInput={(params) => <TextField {...params} label="Add Feat Pool" />}
            sx={{ flex: 1 }}
          />
        </Stack>
      )}
    </Panel>
  );
}
