import { Autocomplete, Box, Button, IconButton, Popover, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";

import { CardTitle, Panel, ScrollSafeListbox, SubsectionTitle } from "@/client/src/components/common/index.ts";
import { AddIcon, DeleteIcon, RemoveIcon } from "@/client/src/components/icons/index.ts";
import { useDebouncedValue, useListboxQuery } from "@/client/src/hooks/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import type { ProgressionGrants, RulesWords } from "@/client/src/lib/queries.ts";
import { entityTypeLabel, type PositionWord } from "@/client/src/lib/rulesetLabels.ts";
import { grantLabel, poolsOf } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { useEntityOptions } from "@/client/src/pages/rulesets/components/index.ts";
import { useEntityFields } from "@/client/src/pages/rulesets/hooks/index.ts";
import { entityOptionsQuery } from "@/client/src/pages/rulesets/optionQueries.ts";
import { isRecord } from "@/shared/isRecord.ts";

import { OwnedToggles, type ToggleNote } from "./OwnedToggles.tsx";
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
  /** A feature taken off the owner: granted at none of its owned entities once saved */
  onRemoveFeature: (row: FeatureRow) => void;
  /** A pool taken off the owner: no picks in it at any of its owned entities once saved */
  onRemovePool: (pool: PoolRow) => void;
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

/** The pool picks are set in, at an owned entity, and its toggle, which the box opens under (`anchor`). */
interface Picking {
  anchor: HTMLElement;
  ownedId: string;
  poolId: string;
}

/** A pool's picks at an owned entity (`count`, 1 at least), its box's: fewer, more, or none, its `onPick`'s. */
interface PicksBoxProps {
  count: number;
  max: number;
  onClose: () => void;
  onPick: (count: number) => void;
  picking: Picking | null;
  title: string;
}

/** A row's remove button, which names the row (`name`). */
interface RemoveRowButtonProps {
  name: string;
  onRemove: () => void;
}

/** A row's name, and what it is (a feature's pool, or its rules' word for a pool: 3.5's feat pool). */
interface RowNameProps {
  kind: string;
  name: string;
}

/**
 * The box a filled pool toggle opens under it: its picks there, one fewer down to one or one more up to the rules' most
 * (`max`), and Remove, which clears the owned entity's picks and closes it.
 */
function PicksBox({ count, max, onClose, onPick, picking, title }: PicksBoxProps) {
  return (
    <Popover
      open={picking !== null}
      anchorEl={picking?.anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      transformOrigin={{ vertical: "top", horizontal: "center" }}
      slotProps={{ paper: { role: "dialog", "aria-label": title } }}
    >
      <Stack spacing={1} sx={{ p: 2, minWidth: 220 }}>
        <SubsectionTitle>{title}</SubsectionTitle>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <IconButton size="small" aria-label="Fewer Picks" disabled={count <= 1} onClick={() => onPick(count - 1)}>
            <RemoveIcon fontSize="small" />
          </IconButton>
          <Typography aria-live="polite" sx={{ minWidth: 28, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
            {count}
          </Typography>
          <IconButton size="small" aria-label="More Picks" disabled={count >= max} onClick={() => onPick(count + 1)}>
            <AddIcon fontSize="small" />
          </IconButton>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {count === 1 ? "pick" : "picks"}
          </Typography>
        </Stack>
        <Button
          size="small"
          variant="contained"
          color="error"
          onClick={() => {
            onPick(0);
            onClose();
          }}
          sx={{ alignSelf: "flex-start" }}
        >
          Remove
        </Button>
      </Stack>
    </Popover>
  );
}

/** A row's remove button, at its end: the bin, in red. */
function RemoveRowButton({ name, onRemove }: RemoveRowButtonProps) {
  return (
    <Tooltip title="Remove">
      <IconButton size="small" color="error" aria-label={`Remove ${name}`} onClick={onRemove}>
        <DeleteIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

/** A row's name, and what it is under it. */
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
 * a row each, whose toggles grant the feature or give picks in the pool at an owned entity, its bin at its end removing
 * it; and pickers that add a feature or a pool, granted at no owned entity until one is clicked. A feature that doesn't
 * stack is granted at one owned entity: a click on another moves it there, and one past its first saved before the
 * rule gives nothing, as their notes say. An empty pool toggle gives a pick; a filled one opens a box that sets how
 * many, or removes them. Read-only, it only shows them.
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
  onRemoveFeature,
  onRemovePool,
  pools,
  positionWord,
  readOnly,
  rulesetId,
  savedFeatures,
  savedPools,
  words,
}: OwnerFeaturesCardProps) {
  const [search, setSearch] = useState("");
  const [picking, setPicking] = useState<Picking | null>(null);
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
      // Whether it stacks, at the stored field its rules say
      stacks: isRecord(entity.fields) && entity.fields[grants.stacks] === true,
      toId: entity.id,
      viaId: pool.id,
      viaName: pool.name,
    })),
  );
  const positionOf = (ownedId: string) => ownedEntities.find(({ id }) => id === ownedId)?.position;
  const levelOf = (position: number | undefined) => `${positionWord.one.toLowerCase()} ${position ?? ""}`.trim();
  // A feat's owned entities, whichever of its rows grants it there (a feat granted through two pools is two rows)
  const featGrantedAt = (row: FeatureRow) => [
    ...new Set(features.filter((other) => other.toId === row.toId).flatMap((other) => other.grantedAt)),
  ];
  // A feature that doesn't stack is granted at its first owned entity: a click on another moves it, and one saved
  // there past its first gives nothing
  const featureNote = (row: FeatureRow, ownedId: string): ToggleNote | undefined => {
    const grantedAt = featGrantedAt(row);
    if (row.stacks || grantedAt.length === 0) return undefined;
    const [firstId] = grantedAt.toSorted((a, b) => (positionOf(a) ?? 0) - (positionOf(b) ?? 0));
    if (ownedId === firstId) return undefined;
    const idle = row.grantedAt.includes(ownedId);
    const text = (idle ? grants.words.repeat : grants.words.single)
      .replace("{name}", row.name)
      .replace("{level}", levelOf(positionOf(firstId)));
    // A viewer reads a grant that gives nothing; a move is an editor's
    if (!idle && readOnly) return undefined;
    return { kind: idle ? "idle" : "move", text };
  };
  // A click clears a filled toggle; an empty one grants a feature that stacks there too, and moves one that doesn't,
  // off the feat's other rows too
  const handleFeatureClick = (row: FeatureRow, ownedId: string) => {
    if (row.grantedAt.includes(ownedId)) {
      onFeatureGrantedAt(
        row,
        row.grantedAt.filter((id) => id !== ownedId),
      );
      return;
    }
    if (row.stacks) {
      onFeatureGrantedAt(row, [...row.grantedAt, ownedId]);
      return;
    }
    for (const other of features)
      if (other.key !== row.key && other.toId === row.toId && other.grantedAt.length > 0) onFeatureGrantedAt(other, []);
    onFeatureGrantedAt(row, [ownedId]);
  };
  const pickingPool = picking && pools.find((pool) => pool.id === picking.poolId);
  const pickingCount = (picking && pickingPool?.picks[picking.ownedId]) || 0;
  const savedPicks = (poolId: string, ownedId: string) =>
    savedPools.find((saved) => saved.id === poolId)?.picks[ownedId] ?? 0;
  // A row's name, its toggles and its bin at its end; on a phone its toggles take a line of their own under them
  const grid = {
    display: "grid",
    gridTemplateColumns: readOnly ? { xs: "1fr", sm: "200px 1fr" } : { xs: "1fr auto", sm: "200px 1fr auto" },
    gap: { xs: 0.5, sm: 2 },
    alignItems: "center",
  };
  const togglesCell = { gridColumn: { xs: "1 / -1", sm: "auto" }, gridRow: { xs: 2, sm: "auto" }, minWidth: 0 };

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
              <Box sx={togglesCell}>
                <OwnedToggles
                  label={row.name}
                  noteOf={(ownedId) => featureNote(row, ownedId)}
                  ownedEntities={ownedEntities}
                  positionWord={positionWord}
                  readOnly={readOnly}
                  value={(ownedId) => (row.grantedAt.includes(ownedId) ? 1 : 0)}
                  saved={(ownedId) =>
                    savedFeatures.find((saved) => saved.key === row.key)?.grantedAt.includes(ownedId) ? 1 : 0
                  }
                  onToggle={(ownedId) => handleFeatureClick(row, ownedId)}
                />
              </Box>
              {!readOnly && <RemoveRowButton name={row.name} onRemove={() => onRemoveFeature(row)} />}
            </Box>
          ))}
          {pools.map((pool) => (
            <Box key={pool.id} sx={grid}>
              <RowName name={pool.name} kind={grants.words.pool} />
              <Box sx={togglesCell}>
                <OwnedToggles
                  label={pool.name}
                  ownedEntities={ownedEntities}
                  positionWord={positionWord}
                  readOnly={readOnly}
                  value={(ownedId) => pool.picks[ownedId] ?? 0}
                  saved={(ownedId) => savedPicks(pool.id, ownedId)}
                  onToggle={(ownedId, anchor) => {
                    // An empty toggle gives a pick; a filled one opens the box that sets how many
                    if ((pool.picks[ownedId] ?? 0) === 0) onPoolPick(pool.id, ownedId, 1);
                    else setPicking({ anchor, ownedId, poolId: pool.id });
                  }}
                />
              </Box>
              {!readOnly && <RemoveRowButton name={pool.name} onRemove={() => onRemovePool(pool)} />}
            </Box>
          ))}
        </Stack>
      </Box>
      <PicksBox
        picking={pickingPool ? picking : null}
        count={pickingCount}
        max={grants.maxPicks}
        title={`${positionWord.one} ${positionOf(picking?.ownedId ?? "") ?? ""} · ${pickingPool?.name ?? ""}`}
        onClose={() => setPicking(null)}
        onPick={(count) => picking && onPoolPick(picking.poolId, picking.ownedId, count)}
      />
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
