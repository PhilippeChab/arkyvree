import {
  Autocomplete,
  Box,
  Button,
  IconButton,
  Link as MuiLink,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { CardTitle, Panel, ScrollSafeListbox, SubsectionTitle } from "@/client/src/components/common/index.ts";
import { AddIcon, DeleteIcon, RemoveIcon } from "@/client/src/components/icons/index.ts";
import { useCustomizationPages, useDebouncedValue, useListboxQuery } from "@/client/src/hooks/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import type { ProgressionGrants, RulesWords } from "@/client/src/lib/queries.ts";
import { entityTypeLabel, type PositionWord } from "@/client/src/lib/rulesetLabels.ts";
import { grantLabel } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { newFeatureQuery } from "@/client/src/pages/rulesets/details/owners/ownerSectionQueries.ts";
import { entityOptionsQuery } from "@/client/src/pages/rulesets/optionQueries.ts";
import { buildEntityPagePath } from "@/shared/customization/entities.ts";

import { OwnedToggles, type ToggleNote } from "./OwnedToggles.tsx";
import {
  type FeatureNote,
  type FeatureOffers,
  type FeatureRow,
  type PoolRow,
  readFeatureOptions,
} from "./progressionDraft.ts";

interface OwnerFeaturesCardProps {
  /** A feature is being created */
  creating: boolean;
  /** The features the owner grants, with the owned entities the tab holds for each */
  features: readonly FeatureRow[];
  /** The kind its owned entities grant (`references`: 3.5's `feats`), and its word for them ("Feats") */
  granted: { many: string; type: string };
  /** What its owned entities grant, as its rules describe it: its pools' kind and scope, its words */
  grants: ProgressionGrants;
  /** The rules' notes on its features: the draft's, as its plan answers it, else the saved ones */
  notes: readonly FeatureNote[];
  /** The notes are another draft's while its plan answers the last change: a feature's click waits for them */
  notesWaiting: boolean;
  /** What the owner is offered, as its progression's answer gives it (`readFeatureOffers`): none while it loads */
  offers: FeatureOffers | undefined;
  onAddFeature: (row: FeatureRow) => void;
  onAddPool: (pool: PoolRow) => void;
  /** A new feature, by its name as typed ("Hex"), which its rules name and put in the owner's own pool */
  onCreateFeature: (name: string) => void;
  onFeatureGrantedAt: (row: FeatureRow, ownedIds: string[]) => void;
  onPoolPick: (poolId: string, ownedId: string, count: number) => void;
  /** A feature taken off the owner: granted at none of its owned entities once saved */
  onRemoveFeature: (row: FeatureRow) => void;
  /** A pool taken off the owner: no picks in it at any of its owned entities once saved */
  onRemovePool: (pool: PoolRow) => void;
  /** The owner's owned entities, each its number (`position`) */
  ownedEntities: readonly { id: string; position: number }[];
  /** The owner, whose offered features its granted kind's list narrows to (`grants.featuresFilter`) */
  ownerId: string;
  /** The owner's kind (3.5's `classes`), whose routes answer what a typed name creates */
  ownerType: string;
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

/** A row's name, the page it opens (`to`: its entity's), and what it is (`kind`: a feature's pool, or 3.5's feat pool). */
interface RowNameProps {
  kind: string;
  name: string;
  to: string;
}

/** A feature picker's option: a feature to add, or a new one to create by its name as typed (`create`). */
type FeatureOption = FeatureRow | { create: string; label: string };

/**
 * The option that creates a feature by what's typed, as its rules answer it (`created`: its name, "Hex (Witch)", and
 * whether the ruleset has it), in the create's words (`create`): none before an answer, for a name the ruleset has, or
 * while the answer is another search's (`settled` false).
 */
function newFeatureOption(
  created: { exists: boolean; name: string } | undefined,
  { create, settled }: { create: string; settled: boolean },
): FeatureOption[] {
  if (!created || created.exists || !settled) return [];
  return [{ create: created.name, label: create.replace("{name}", () => created.name) }];
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
function RowName({ name, kind, to }: RowNameProps) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.3 }}>
        {/* In a tab of its own, so the progression's unsaved levels stay */}
        <MuiLink component={Link} to={to} target="_blank" underline="hover" color="inherit">
          {name}
        </MuiLink>
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
 * it; and pickers that add a feature or a pool, granted at no owned entity until one is clicked. A feature toggle a
 * click fills or empties, or, where the rules' note says (`notes`: a feature that doesn't stack), moves the feature
 * there; where it gives nothing, the note says too. An empty pool toggle gives a pick; a filled one opens a box that
 * sets how many, or removes them. Read-only, it only shows them.
 */
export function OwnerFeaturesCard({
  creating,
  features,
  granted,
  grants,
  ownedEntities,
  onAddFeature,
  onAddPool,
  onCreateFeature,
  onFeatureGrantedAt,
  onPoolPick,
  onRemoveFeature,
  onRemovePool,
  notes,
  notesWaiting,
  offers,
  ownerId,
  ownerType,
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
  const pages = useCustomizationPages();
  // The granted kind's entities the owner may grant, searched on the server: a ruleset has hundreds; the last results
  // stay as the next load
  const debouncedSearch = useDebouncedValue(search);
  const {
    items: entities,
    isLoading,
    isFetching,
    error,
    onScroll,
  } = useListboxQuery({
    ...entityOptionsQuery(rulesetId, granted.type, debouncedSearch, {
      filters: { [grants.featuresFilter]: ownerId },
      limit: 50,
    }),
    placeholderData: keepPreviousData,
    enabled: !readOnly,
  });
  // What the search creates, as its rules name it
  const typed = debouncedSearch.trim();
  const newFeature = useQuery({ ...newFeatureQuery(rulesetId, ownerType, ownerId, typed), enabled: !readOnly });
  // Each entity's options, as its rules describe it for the owner: the class's own first, one per pool it's granted
  // through
  const entityOptions = entities.flatMap(readFeatureOptions);
  const featureOptions: FeatureOption[] = [
    ...entityOptions.filter((option) => !features.some((row) => row.key === option.key)),
    ...newFeatureOption(newFeature.data, {
      create: grants.words.create,
      // The answers are what's typed: none still loading, nor typed since
      settled: search === debouncedSearch && !isFetching && !newFeature.isFetching,
    }),
  ];
  const poolOptions = (offers?.offeredPools ?? []).filter((option) => !pools.some((pool) => pool.id === option.id));
  const positionOf = (ownedId: string) => ownedEntities.find(({ id }) => id === ownedId)?.position;
  // A toggle's note, as the rules wrote it for what the card holds: where a feature gives nothing, and, for an editor,
  // where a click moves it (any toggle of its row not granting it)
  const noteOf = (row: FeatureRow) => notes.find((note) => note.toId === row.toId);
  const featureNote = (row: FeatureRow, ownedId: string): ToggleNote | undefined => {
    const note = noteOf(row);
    if (!note) return undefined;
    if (row.grantedAt.includes(ownedId))
      return note.idle.includes(ownedId) ? { kind: "idle", text: note.idleText } : undefined;
    return readOnly ? undefined : { kind: "move", text: note.moveText };
  };
  // A click empties a filled toggle, and fills an empty one; where the rules note the feature, it moves there, leaving
  // the owned entities they name on each of its rows
  const handleFeatureClick = (row: FeatureRow, ownedId: string) => {
    if (row.grantedAt.includes(ownedId)) {
      onFeatureGrantedAt(
        row,
        row.grantedAt.filter((id) => id !== ownedId),
      );
      return;
    }
    const from = noteOf(row)?.from ?? [];
    const left = (other: FeatureRow) => other.grantedAt.filter((id) => !from.includes(id));
    for (const other of features) {
      if (other.key !== row.key && other.toId === row.toId && left(other).length < other.grantedAt.length)
        onFeatureGrantedAt(other, left(other));
    }
    onFeatureGrantedAt(row, [...left(row), ownedId]);
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
        {/* On a phone a row is its name over its toggles: farther apart, so a row's toggles don't touch the next name */}
        <Stack spacing={{ xs: 2, sm: 0.75 }} sx={{ minWidth: { sm: 640 } }}>
          {features.map((row) => (
            <Box key={row.key} sx={grid}>
              <RowName
                name={row.name}
                kind={row.viaName ?? grants.words.feature}
                to={buildEntityPagePath(rulesetId, granted.type, row.toId, pages)}
              />
              <Box sx={togglesCell}>
                <OwnedToggles
                  label={row.name}
                  noteOf={(ownedId) => featureNote(row, ownedId)}
                  busy={notesWaiting}
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
              <RowName
                name={pool.name}
                kind={grants.words.pool}
                to={buildEntityPagePath(rulesetId, grants.pools.type, pool.id, pages)}
              />
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
            options={featureOptions}
            getOptionLabel={(option) =>
              "create" in option ? option.label : grantLabel(option.name, option.viaName ?? "")
            }
            getOptionKey={(option) => ("create" in option ? "create" : option.key)}
            value={null}
            disabled={creating}
            onChange={(_, option) => {
              if (!option) return;
              if ("create" in option) onCreateFeature(option.create);
              else onAddFeature(option);
            }}
            // The field shows what's typed, which searches: a pick or a clear empties both
            inputValue={search}
            onInputChange={(_, input, reason) => setSearch(reason === "input" ? input : "")}
            filterOptions={(options) => options}
            loading={isLoading}
            noOptionsText={emptyOptionsText(granted.many, error ?? newFeature.error)}
            slotProps={{ listbox: { component: ScrollSafeListbox, onScroll } }}
            renderInput={(params) => <TextField {...params} label={grants.words.add} />}
            sx={{ flex: 1 }}
          />
          <Autocomplete
            size="small"
            options={poolOptions}
            getOptionLabel={(option) => option.name}
            getOptionKey={(option) => option.id}
            value={null}
            loading={!offers}
            noOptionsText={emptyOptionsText(entityTypeLabel(grants.pools.type, words, true), undefined)}
            onChange={(_, option) => option && onAddPool({ id: option.id, name: option.name, picks: {} })}
            renderInput={(params) => <TextField {...params} label={grants.words.addPool} />}
            sx={{ flex: 1 }}
          />
        </Stack>
      )}
    </Panel>
  );
}
