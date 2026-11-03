import { Autocomplete, Box, Stack, TextField, Typography } from "@mui/material";
import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";

import { CardTitle, Panel, ScrollSafeListbox } from "@/client/src/components/common/index.ts";
import { useDebouncedValue, useListboxQuery } from "@/client/src/hooks/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import type { ProgressionGrants, RulesWords } from "@/client/src/lib/queries.ts";
import { entityTypeLabel, type PositionWord } from "@/client/src/lib/rulesetLabels.ts";
import { grantLabel, poolsOf } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { useEntityOptions } from "@/client/src/pages/rulesets/components/index.ts";
import { useEntityFields } from "@/client/src/pages/rulesets/hooks/index.ts";
import { entityOptionsQuery } from "@/client/src/pages/rulesets/optionQueries.ts";

import { OwnedToggles } from "./OwnedToggles.tsx";
import { describeFeatureKey, type FeatureRow, type PoolRow } from "./progressionDraft.ts";

interface OwnerFeaturesCardProps {
  /** The features the owner grants, with the owned entities the tab holds for each */
  features: readonly FeatureRow[];
  /** The kind its owned entities grant (`references`: 3.5's `feats`), and its word for them ("Feats") */
  granted: { many: string; type: string };
  /** What its owned entities grant, as its rules describe it: its pools' kind and scope, its words */
  grants: ProgressionGrants;
  onAddFeature: (row: FeatureRow) => void;
  onAddPool: (pool: PoolRow) => void;
  onFeatureGrantedAt: (row: FeatureRow, ownedIds: string[]) => void;
  onPoolPick: (poolId: string, ownedId: string, count: number) => void;
  /** The owner's owned entities, each its number (`position`) */
  ownedEntities: readonly { id: string; position: number }[];
  /** The pools the owner's owned entities give picks in, with the picks the tab holds for each */
  pools: readonly PoolRow[];
  /**
   * Its rules' word for an owned entity's position along its owner, which names one ("Level 3"), and several ("Levels")
   */
  positionWord: PositionWord;
  readOnly: boolean;
  rulesetId: string;
  /** The features as saved, whose owned entities granting them a changed toggle is outlined against */
  savedFeatures: readonly FeatureRow[];
  /** The pools as saved */
  savedPools: readonly PoolRow[];
  /** Its rules' words, which name its pools' kind */
  words: RulesWords | undefined;
}

/** A row's name, and what it is (a feature's pool, or its rules' word for a pool: 3.5's feat pool). */
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
 * An owner's features and pools by position (3.5's feats and feat pools), on its Progression tab, in its rules' words:
 * a row each, whose toggles grant the feature (a feature granted at several owned entities stacks) or give picks in the
 * pool at an owned entity, a click each; and pickers that add a feature or a pool, granted at no owned entity until one
 * is clicked. Read-only, it only shows them.
 */
export function OwnerFeaturesCard({
  features,
  granted,
  grants,
  ownedEntities,
  onAddFeature,
  onAddPool,
  onFeatureGrantedAt,
  onPoolPick,
  pools,
  positionWord,
  readOnly,
  rulesetId,
  savedFeatures,
  savedPools,
  words,
}: OwnerFeaturesCardProps) {
  const [search, setSearch] = useState("");
  // The granted kind's entities, searched on the server: a ruleset has hundreds; the last results stay as the next load
  const {
    items: entities,
    isLoading,
    error,
    onScroll,
  } = useListboxQuery({
    ...entityOptionsQuery(rulesetId, granted.type, useDebouncedValue(search), { limit: 50 }),
    placeholderData: keepPreviousData,
    enabled: !readOnly,
  });
  const { fetchedOptions: poolOptions, autocompleteProps } = useEntityOptions(rulesetId, grants.pools.type, {
    enabled: !readOnly,
    limit: 10,
    scope: grants.pools.scope,
    what: entityTypeLabel(grants.pools.type, words, true),
  });
  // An entity's pools, where its rules' fields say a read holds them
  const { fields: grantedFields } = useEntityFields(rulesetId, granted.type);
  const entityOptions = entities.flatMap((entity) =>
    poolsOf(grantedFields ?? [], entity).map((pool): FeatureRow => ({
      key: describeFeatureKey({ toId: entity.id, viaId: pool.id }),
      grantedAt: [],
      name: entity.name,
      toId: entity.id,
      viaId: pool.id,
      viaName: pool.name,
    })),
  );
  const savedPicks = (poolId: string, ownedId: string) =>
    savedPools.find((saved) => saved.id === poolId)?.picks[ownedId] ?? 0;
  const grid = {
    display: "grid",
    gridTemplateColumns: { xs: "1fr", sm: "200px 1fr" },
    gap: { xs: 0.5, sm: 2 },
    alignItems: "center",
  };

  return (
    <Panel spacing={2}>
      <CardTitle>{grants.words.title}</CardTitle>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        {grants.words.help}
      </Typography>
      <Box sx={{ overflowX: "auto" }}>
        <Stack spacing={0.75} sx={{ minWidth: { sm: 640 } }}>
          {features.map((row) => (
            <Box key={row.key} sx={grid}>
              <RowName name={row.name} kind={row.viaName ?? grants.words.feature} />
              <OwnedToggles
                label={row.name}
                ownedEntities={ownedEntities}
                positionWord={positionWord}
                readOnly={readOnly}
                value={(ownedId) => (row.grantedAt.includes(ownedId) ? 1 : 0)}
                saved={(ownedId) =>
                  savedFeatures.find((saved) => saved.key === row.key)?.grantedAt.includes(ownedId) ? 1 : 0
                }
                onToggle={(ownedId) =>
                  onFeatureGrantedAt(
                    row,
                    row.grantedAt.includes(ownedId)
                      ? row.grantedAt.filter((id) => id !== ownedId)
                      : [...row.grantedAt, ownedId],
                  )
                }
              />
            </Box>
          ))}
          {pools.map((pool) => (
            <Box key={pool.id} sx={grid}>
              <RowName name={pool.name} kind={grants.words.pool} />
              <OwnedToggles
                label={pool.name}
                ownedEntities={ownedEntities}
                positionWord={positionWord}
                readOnly={readOnly}
                value={(ownedId) => pool.picks[ownedId] ?? 0}
                saved={(ownedId) => savedPicks(pool.id, ownedId)}
                onToggle={(ownedId) => {
                  // A click adds a pick, up to two (or the saved count, when more), then clears the owned entity
                  const count = pool.picks[ownedId] ?? 0;
                  const most = Math.max(2, savedPicks(pool.id, ownedId));
                  onPoolPick(pool.id, ownedId, count >= most ? 0 : count + 1);
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
            options={entityOptions.filter((option) => !features.some((row) => row.key === option.key))}
            getOptionLabel={(option) => grantLabel(option.name, option.viaName ?? "")}
            getOptionKey={(option) => option.key}
            value={null}
            onChange={(_, option) => option && onAddFeature(option)}
            onInputChange={(_, input, reason) => {
              if (reason === "input") setSearch(input);
            }}
            filterOptions={(options) => options}
            loading={isLoading}
            noOptionsText={emptyOptionsText(granted.many, error)}
            slotProps={{ listbox: { component: ScrollSafeListbox, onScroll } }}
            renderInput={(params) => <TextField {...params} label={grants.words.add} />}
            sx={{ flex: 1 }}
          />
          <Autocomplete
            {...autocompleteProps}
            size="small"
            options={poolOptions.filter((option) => !pools.some((pool) => pool.id === option.id))}
            value={null}
            onChange={(_, option) => option && onAddPool({ id: option.id, name: option.name, picks: {} })}
            renderInput={(params) => <TextField {...params} label={grants.words.addPool} />}
            sx={{ flex: 1 }}
          />
        </Stack>
      )}
    </Panel>
  );
}
