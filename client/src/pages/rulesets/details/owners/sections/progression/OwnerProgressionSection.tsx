import { Alert, Box, Stack, Tooltip, Typography } from "@mui/material";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  AddButton,
  BlankState,
  CardTitle,
  EmptyValue,
  ListToolbar,
  LoadError,
  Panel,
  ValueChip,
} from "@/client/src/components/common/index.ts";
import { ProgressionIcon } from "@/client/src/components/icons/index.ts";
import {
  useCustomizationPages,
  useDialogState,
  useFormWith,
  useRules,
  useRulesetPermissions,
} from "@/client/src/hooks/index.ts";
import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { rulesetOptionsQuery } from "@/client/src/lib/queries.ts";
import { entityTypeLabel, formatWordCount, positionWordsOf, withArticle } from "@/client/src/lib/rulesetLabels.ts";
import {
  omittedPlacesOf,
  ownedListsOf,
  type OwnedRead,
  readOwned,
  withoutPlaces,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import {
  CreateOwnedDialog,
  type OwnedCreateFormData,
} from "@/client/src/pages/rulesets/details/owners/components/index.ts";
import { ownedPageOf } from "@/client/src/pages/rulesets/details/owners/ownerKind.ts";
import {
  ownedEntitiesQuery,
  ownerProgressionQuery,
  ownerTableQuery,
  progressionPlanQuery,
} from "@/client/src/pages/rulesets/details/owners/ownerSectionQueries.ts";
import type { OwnerSectionProps } from "@/client/src/pages/rulesets/details/owners/ownerTab.ts";
import { byPosition } from "@/client/src/pages/rulesets/details/owners/sections/byPosition.ts";
import { useOpenEntity } from "@/client/src/pages/rulesets/hooks/index.ts";
import { buildEntityPagePath } from "@/shared/customization/entities.ts";
import { isRecord } from "@/shared/isRecord.ts";

import { CHANGED_CELL_SX } from "./changedCell.ts";
import {
  buildOwnedBatch,
  defaultBatchChoices,
  listBatchCounts,
  listOpenPositions,
  listTrackValues,
  type OwnerTrack,
  type ShownOwned,
} from "./ownedBatch.ts";
import { OwnerFeaturesCard } from "./OwnerFeaturesCard.tsx";
import {
  amountTrackKey,
  buildProgressionBody,
  describeFeatureRows,
  type PoolRow,
  readEditedTrack,
  readFeatureNotes,
  readFeatureOffers,
  readTrack,
  type TrackKey,
  withAddedFeatures,
  withAddedPools,
} from "./progressionDraft.ts";
import { detectPreset, formatTrackValue, presetsOf } from "./progressionPresets.ts";
import { ProgressionSaveBar } from "./ProgressionSaveBar.tsx";
import { ProgressionTrackRow } from "./ProgressionTrackRow.tsx";
import { useCreateFeature } from "./useCreateFeature.ts";
import { useCreateOwnedBatch } from "./useCreateOwnedBatch.ts";
import { useProgressionDraft } from "./useProgressionDraft.ts";
import { useProgressionSave } from "./useProgressionSave.ts";

/** A pool of a progression's answer: its `id`, its name and its picks by owned entity. */
function readPool(pool: unknown): PoolRow[] {
  if (!isRecord(pool)) return [];
  const { id, name, picks } = pool;
  if (typeof id !== "string" || typeof name !== "string" || !isRecord(picks)) return [];
  return [{ id, name, picks: picks as PoolRow["picks"] }];
}

/**
 * An owner's Progression tab: its table, the owned entities' tracks (3.5's base attack bonus, saves and skill points)
 * and features at once, which opens an owned entity's page from its row; its progression, each track a preset to follow
 * or its owned entities to set; and its features and pools by position (3.5's feat pools; shown read-only to who can't
 * edit). What it changes waits for its save bar, which writes it all at once. Its owned entities are its rules' owner
 * kind's owned kind's, their grants and amounts at their lists' roles. A track its rules leave out for the owner's kind
 * (`omittedFor`: 3.5's bonded creature's base attack bonus, saves and skill points, which its sheet works out) has no
 * column nor row, and its saves send none of it.
 */
export function OwnerProgressionSection({
  rulesetId,
  ownerId,
  ownerKind,
  ownerName,
  ownerType,
  ruleset,
}: OwnerSectionProps) {
  const openEntity = useOpenEntity();
  const pages = useCustomizationPages();
  const queryClient = useQueryClient();
  const { rules } = useRules(ruleset.baseRules);
  const ownedPage = ownedPageOf(rules);
  const ownedType = ownedPage?.type ?? "";
  // Its tracks, an owned entity's fields and its amounts, and what its owned entities grant, as its rules describe them:
  // the tracks the owner's kind has
  const progressionRules = rules?.progression;
  const grantsRules = progressionRules?.grants;
  const trackRules = (progressionRules?.tracks ?? []).filter(({ omittedFor }) => !omittedFor?.includes(ownerKind));
  // Its owned entities' fields the owner's kind leaves out, and their lists without them (no amounts where it has no
  // track of them)
  const omitted = omittedPlacesOf(rules?.fields[ownedType], progressionRules?.tracks ?? [], ownerKind);
  const ownedLists = ownedListsOf(withoutPlaces(rules?.fields[ownedType] ?? [], omitted));
  const amountsType = ownedLists.amounts?.references ?? "";
  const owner = entityTypeLabel(ownedPage?.owner ?? "", rules?.words).toLowerCase();
  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);
  // An owned entity's amounts' entities, the ruleset's (3.5's saves); none read where its owned entities have no
  // amounts
  const { data: amountEntities, error: amountsError } = useQuery(
    rulesetOptionsQuery(amountsType, ownedLists.amounts && rulesetId),
  );
  const fieldTracks = trackRules.flatMap(({ field, key, source }) =>
    source === "field" && field ? [{ field, key }] : [],
  );

  const query = ownedEntitiesQuery(rulesetId, ownerType, ownerId);
  const { data: ownedRows, isLoading, isFetching, error } = useQuery(query);
  const { data: progression, error: progressionError } = useQuery(ownerProgressionQuery(rulesetId, ownerType, ownerId));
  // Its pools' totals, at the table its rules say; none read where its owned entities grant none past their lists
  const { data: poolTotals, error: poolsError } = useQuery(
    ownerTableQuery(rulesetId, ownerType, ownerId, grantsRules?.table),
  );
  const savedRows = (ownedRows ?? []).toSorted(byPosition);
  const ownedEntities = savedRows.map((row) => readOwned(row, ownedLists, fieldTracks));
  const savedFeatures = describeFeatureRows(ownedEntities);
  // Its pools, and the picks a granted entity gives in them, at the keys its rules say
  const answer: Record<string, unknown> | undefined = progression;
  const savedPools = (Array.isArray(answer?.pools) ? answer.pools : []).flatMap(readPool);
  const picksOf = (entityId: string) => {
    const byEntity = answer?.[grantsRules?.picks ?? ""];
    const picks = isRecord(byEntity) ? byEntity[entityId] : undefined;
    return isRecord(picks) ? (picks as Record<string, number>) : {};
  };
  // An owned entity's totals by pool name, at the key its rules say
  const poolTotalsAt = (ownedId: string) => {
    const totals = poolTotals?.find((row) => row.id === ownedId)?.[grantsRules?.totals ?? ""];
    return isRecord(totals) ? (totals as Record<string, number>) : undefined;
  };
  // Edits change something when they send something, or add a row a save hasn't made the owner's yet
  const draft = useProgressionDraft(ownerId, ownedEntities, !isFetching, (edits) => {
    const body = buildProgressionBody(
      ownedEntities,
      ownedLists,
      fieldTracks,
      amountEntities?.map(({ id }) => id),
      savedFeatures,
      savedPools,
      edits,
    );
    const added =
      withAddedFeatures(savedFeatures, edits).length > savedFeatures.length ||
      withAddedPools(savedPools, edits).length > savedPools.length;
    return Object.keys(body).length > 0 || added;
  });
  const [customTracks, setCustomTracks] = useState<TrackKey[]>([]);
  const save = useProgressionSave(rulesetId, ownerId, {
    ownerType,
    ownedType,
    what: "Progression",
    word: entityTypeLabel(ownerType, rules?.words),
  });

  // A message's word for an owned entity ("Class level")
  const ownedWord = entityTypeLabel(ownedType, rules?.words);
  // An owned entity's position's word, which names one ("Level 3"), and as a sentence says it ("level", "levels")
  const positionWord = positionWordsOf(ownedType, rules?.words);
  const [positionSingular, positionPlural] = [positionWord.one.toLowerCase(), positionWord.many.toLowerCase()];
  const tracks = trackRules.flatMap((rules): OwnerTrack[] =>
    rules.source === "amounts"
      ? (amountEntities ?? []).map((entity) => ({
          key: amountTrackKey(entity.id),
          label: entity.name,
          rules,
          toId: entity.id,
        }))
      : [{ key: rules.key, label: rules.label, rules }],
  );
  // Its create makes one or several at once, alike, always at the owner's next positions (no number to type), each
  // track starting at what the owner's own follow, in one request
  const open = listOpenPositions(
    ownedEntities.map(({ position }) => position),
    progressionRules?.lastPosition,
  );
  // What it makes starts and carries on from the owner as saved: its create waits while the Progression has edits,
  // unsaved or saving (an inherited owner's copy, which a create follows, would drop them)
  const shown: ShownOwned = { entities: ownedEntities, read: readTrack };
  const batchDefaults = defaultBatchChoices(tracks, shown);
  // What a track's choice gives what it makes, under its toggle: its first and its last ("+16/+11/+6 at level 16,
  // +18/+13/+8 at level 20")
  const describeChoice = (track: OwnerTrack) => (choice: number | string, positions: readonly number[]) => {
    const values = listTrackValues(track, choice, positions, shown);
    const at = (index: number) =>
      `${formatTrackValue(track.rules, values[index])} at ${positionSingular} ${positions[index]}`;
    if (positions.length === 0) return undefined;
    return positions.length === 1 ? at(0) : `${at(0)}, ${at(positions.length - 1)}`;
  };
  const createDefaults: OwnedCreateFormData = { choices: batchDefaults, count: 1 };
  const createDialog = useDialogState();
  const createForm = useFormWith<OwnedCreateFormData>(createDefaults);
  const createOwned = useCreateOwnedBatch(
    rulesetId,
    ownerId,
    { ownedType, ownerType, word: { one: ownedWord, many: entityTypeLabel(ownedType, rules?.words, true) } },
    createDialog.close,
  );
  // A created feature's row, granted at no owned entity until one is clicked
  const createFeature = useCreateFeature(
    rulesetId,
    ownerType,
    ownerId,
    { granted: ownedLists.grants?.references ?? "", pools: grantsRules?.pools.type ?? "" },
    draft.addFeature,
  );
  // Opened on one, whatever a cancelled one held
  const handleCreate = () => {
    createForm.reset(createDefaults);
    createDialog.openWith(true);
  };
  // A track left as it opened, or whose entities loaded after it opened, takes its default, as its toggle shows
  const handleCreateSubmit = (data: OwnedCreateFormData) => {
    const choices = Object.fromEntries(tracks.map(({ key }) => [key, data.choices[key] ?? batchDefaults[key]]));
    createOwned.mutate(buildOwnedBatch(open.slice(0, data.count), tracks, choices, ownedLists, shown));
  };
  const valuesOf = (read: (ownedEntity: OwnedRead) => number) =>
    ownedEntities.map((ownedEntity) => ({
      ownedId: ownedEntity.id,
      position: ownedEntity.position,
      value: read(ownedEntity),
    }));

  const features = withAddedFeatures(savedFeatures, draft.edits).map((row) => ({
    ...row,
    grantedAt: draft.edits.features[row.key] ?? row.grantedAt,
  }));
  const pools = withAddedPools(savedPools, draft.edits).map((pool) => ({
    ...pool,
    picks: { ...pool.picks, ...draft.edits.pools[pool.id] },
  }));
  // What the tab changes each pool's total by at each owned entity (by its name, then the owned entity's id): the
  // running difference of its picks, and of the picks its features give where they're granted
  const poolChanges = new Map<string, Map<string, number>>();
  const addChanges = (name: string, changeAt: (ownedId: string) => number) => {
    const byOwnedId = poolChanges.get(name) ?? new Map<string, number>();
    let change = 0;
    for (const { id } of ownedEntities) {
      change += changeAt(id);
      byOwnedId.set(id, (byOwnedId.get(id) ?? 0) + change);
    }
    poolChanges.set(name, byOwnedId);
  };
  for (const pool of pools) {
    const saved = savedPools.find((s) => s.id === pool.id)?.picks ?? {};
    addChanges(pool.name, (id) => (pool.picks[id] ?? 0) - (saved[id] ?? 0));
  }
  for (const row of features) {
    const saved = savedFeatures.find((s) => s.key === row.key)?.grantedAt ?? [];
    const granted = (id: string) => Number(row.grantedAt.includes(id)) - Number(saved.includes(id));
    for (const [name, picks] of Object.entries(picksOf(row.toId))) addChanges(name, (id) => granted(id) * picks);
  }
  const poolNames = [
    ...new Set([
      ...(poolTotals ?? []).flatMap((row) => Object.keys(poolTotalsAt(row.id) ?? {})),
      ...[...poolChanges].filter(([, byOwnedId]) => [...byOwnedId.values()].some(Boolean)).map(([name]) => name),
    ]),
  ].sort();

  const body = buildProgressionBody(
    ownedEntities,
    ownedLists,
    fieldTracks,
    amountEntities?.map(({ id }) => id),
    savedFeatures,
    savedPools,
    draft.edits,
  );
  // The rules' notes on its grants: the draft's, as its plan answers it (the last answer while the next loads), else
  // the saved ones
  const sends = Object.keys(body).length > 0;
  const plan = useQuery({
    ...progressionPlanQuery(rulesetId, ownerType, ownerId, sends ? body : undefined),
    enabled: canEdit,
    placeholderData: keepPreviousData,
  });
  const notesKey = grantsRules?.notes ?? "";
  // A failed plan's notes would be another draft's: none then, the save refusing what the engine refuses
  const notes = readFeatureNotes(
    sends ? (plan.isError ? undefined : plan.data?.[notesKey as keyof typeof plan.data]) : answer?.[notesKey],
  );
  // A pool's id in the save
  const poolIdOf = (pool: Record<string, unknown>) => String(pool.id);
  const changes = [
    ...tracks.flatMap((track) => {
      const before = valuesOf((ownedEntity) => readTrack(ownedEntity, track.key));
      const after = valuesOf((ownedEntity) => readEditedTrack(ownedEntity, track.key, draft.edits));
      const changed = after.filter(({ value }, index) => value !== before[index].value).length;
      if (changed === 0) return [];
      const constant = (values: typeof before) => values.every(({ value }) => value === values[0].value);
      const plain =
        constant(before) && constant(after)
          ? [String(before[0].value), `${after[0].value} ${withArticle(positionSingular)}`]
          : [];
      const presets = presetsOf(track.rules);
      const [from, to] =
        presets.length > 0
          ? [detectPreset(presets, before)?.label ?? "Custom", detectPreset(presets, after)?.label ?? "Custom"]
          : plain;
      const how = from !== to ? `${from} → ${to}, ` : "";
      return [{ key: track.key, label: `${track.label}: ${how}${formatWordCount(changed, positionWord)}` }];
    }),
    ...features.flatMap((row) => {
      const saved = savedFeatures.find((s) => s.key === row.key)?.grantedAt ?? [];
      const changed = ownedEntities.filter(({ id }) => row.grantedAt.includes(id) !== saved.includes(id)).length;
      return changed > 0 ? [{ key: row.key, label: `${row.name}: ${formatWordCount(changed, positionWord)}` }] : [];
    }),
    // A feature or pool added and given no owned entity yet saves nothing, but shows, so its Discard can drop it
    ...features
      .filter((row) => row.grantedAt.length === 0 && !savedFeatures.some((s) => s.key === row.key))
      .map((row) => ({ key: `added:${row.key}`, label: `${row.name}: added, at no ${positionSingular} yet` })),
    ...pools
      .filter((pool) => !savedPools.some((s) => s.id === pool.id))
      .filter((pool) => !Object.values(pool.picks).some((count) => count > 0))
      .map((pool) => ({ key: `added:${pool.id}`, label: `${pool.name}: added, at no ${positionSingular} yet` })),
    ...(body.pools ?? []).map((pool) => {
      const name = pools.find((p) => p.id === poolIdOf(pool))?.name;
      return {
        key: `pool:${poolIdOf(pool)}`,
        label: `${name}: ${formatWordCount(pool.picks.length, positionWord)}`,
      };
    }),
  ];

  // A create waits while the Progression has edits, unsaved or saving
  const createWaits = changes.length > 0 || save.isPending;

  // Its edits, and the tracks' editors they were made in
  const discard = () => {
    draft.discard();
    setCustomTracks([]);
  };
  // What changes while the save runs stays, for the next save
  const handleSave = () => {
    const sent = draft.edits;
    save.mutate(
      { ...body, ...draft.tokens() },
      {
        onSuccess: () => {
          draft.settle(sent);
          setCustomTracks([]);
        },
        // Refused (its owned entities changed since), it's sent again over them as they're read again
        onError: draft.forgetTokens,
      },
    );
  };

  const descriptionByEntity = new Map(
    ownedEntities.flatMap((ownedEntity) => ownedEntity.grants.map((grant) => [grant.toId, grant.toDescription])),
  );
  const featuresAt = (ownedId: string) => features.filter((row) => row.grantedAt.includes(ownedId));
  const columns = [
    { key: "position", label: positionWord.one, width: "8%" },
    ...tracks.map((track) => ({ key: track.key, label: track.rules.shortLabel ?? track.label, width: "9%" })),
    ...poolNames.map((name) => ({ key: `pool:${name}`, label: name, width: "7%" })),
    // The rest of the table's width, however many tracks and pools it has
    { key: "grants", label: progressionRules?.grantsLabel ?? "", slot: "block" as const },
  ];

  const renderCell = (ownedEntity: OwnedRead, columnKey: string) => {
    if (columnKey === "position") return <ValueChip label={ownedEntity.position} color="primary" />;
    if (columnKey.startsWith("pool:")) {
      const name = columnKey.slice(5);
      const saved = poolTotalsAt(ownedEntity.id)?.[name];
      const change = poolChanges.get(name)?.get(ownedEntity.id) ?? 0;
      const total = change === 0 ? saved : (saved ?? 0) + change;
      return (
        <Typography variant="body2" sx={[change !== 0 && CHANGED_CELL_SX]}>
          {total ?? <EmptyValue />}
        </Typography>
      );
    }
    if (columnKey === "grants") {
      const granted = featuresAt(ownedEntity.id);
      const suffix = ` (${ownerName})`;
      return granted.length > 0 ? (
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
          {granted.map((row) => (
            <Tooltip
              describeChild
              key={row.key}
              title={descriptionByEntity.get(row.toId) || row.viaName || ""}
              placement="top"
              enterDelay={300}
              slotProps={{ tooltip: { sx: { maxWidth: 400 } } }}
            >
              <ValueChip
                color="default"
                label={row.name.endsWith(suffix) ? row.name.slice(0, -suffix.length) : row.name}
              />
            </Tooltip>
          ))}
        </Stack>
      ) : (
        <EmptyValue />
      );
    }
    const track = tracks.find((t) => t.key === columnKey);
    if (!track) return null;
    const value = readEditedTrack(ownedEntity, track.key, draft.edits);
    const changed = value !== readTrack(ownedEntity, track.key);
    return (
      <Typography variant="body2" sx={[changed && CHANGED_CELL_SX]}>
        {formatTrackValue(track.rules, value)}
      </Typography>
    );
  };

  return (
    <Stack spacing={3}>
      {/* Once the owner has every position its rules give, it takes no more; it waits for its owned entities, and while
          its Progression has edits, unsaved or saving, which a create's copy of an inherited owner would drop */}
      {canEdit && open.length > 0 && (
        <ListToolbar
          actions={
            <Tooltip describeChild title={createWaits ? `Save or discard the progression's changes first` : ""}>
              <span>
                <AddButton
                  label={`Add ${positionWord.one}`}
                  onClick={handleCreate}
                  disabled={!ownedRows || createWaits}
                />
              </span>
            </Tooltip>
          }
        />
      )}
      {!!amountsError && !amountEntities && (
        <LoadError what={entityTypeLabel(amountsType, rules?.words, true)} error={amountsError} />
      )}
      {!!progressionError && !progression && (
        <LoadError what={grantsRules?.words.pools ?? ""} error={progressionError} />
      )}
      {!!poolsError && !poolTotals && <LoadError what={grantsRules?.words.totals ?? ""} error={poolsError} />}
      {canEdit && plan.isError && (
        <Alert severity="error">
          {errorMessage(plan.error, `Failed to check the ${grantsRules?.words.title.toLowerCase() ?? "progression"}`)}
        </Alert>
      )}
      <RulesetSectionTable
        what={positionWord.many}
        error={error}
        data={ownedRows ? ownedEntities : undefined}
        isLoading={isLoading}
        columns={columns}
        onRowClick={(ownedEntity) => openEntity(buildEntityPagePath(rulesetId, ownedType, ownedEntity.id, pages))}
        onRowPrefetch={(ownedEntity) =>
          void queryClient.prefetchQuery(customizationEntityQuery(rulesetId, ownedPage, ownedEntity.id))
        }
        renderCell={renderCell}
        empty={
          <BlankState
            icon={ProgressionIcon}
            title={`No ${positionPlural}`}
            description={
              canEdit
                ? `Start by adding the first ${positionSingular} for this ${owner}.`
                : `This ${owner} doesn't have any ${positionPlural} defined yet.`
            }
          />
        }
      />
      {canEdit && ownedEntities.length > 0 && (
        <Panel spacing={0}>
          <CardTitle>Progression</CardTitle>
          <Box sx={{ pt: 1 }}>
            {tracks.map((track) => (
              <ProgressionTrackRow
                key={track.key}
                id={`progression-${track.key}`}
                label={track.label}
                max={track.rules.max}
                min={track.rules.min}
                unitLabel={track.rules.unitLabel}
                ownerWord={owner}
                positionWord={positionWord}
                custom={customTracks.includes(track.key)}
                onCustomChange={(open) =>
                  setCustomTracks((current) => [
                    ...current.filter((key) => key !== track.key),
                    ...(open ? [track.key] : []),
                  ])
                }
                format={(value) => formatTrackValue(track.rules, value)}
                presets={track.rules.presets.length > 0 ? presetsOf(track.rules) : undefined}
                saved={valuesOf((ownedEntity) => readTrack(ownedEntity, track.key))}
                values={valuesOf((ownedEntity) => readEditedTrack(ownedEntity, track.key, draft.edits))}
                onChange={(values) =>
                  draft.setTrack(
                    track.key,
                    Object.fromEntries(
                      // A value as saved stays, past the bound or not (a Revert's)
                      Object.entries(values).map(([ownedId, value]) => {
                        const ownedEntity = ownedEntities.find(({ id }) => id === ownedId);
                        const saved = ownedEntity && readTrack(ownedEntity, track.key);
                        return [ownedId, value === saved ? value : Math.min(value, track.rules.max)];
                      }),
                    ),
                  )
                }
              />
            ))}
          </Box>
        </Panel>
      )}
      {/* Its pools wait for the owner's progression, so a pool it has can't be added again */}
      {ownedEntities.length > 0 &&
        progression &&
        grantsRules &&
        ownedLists.grants &&
        (features.length > 0 || pools.length > 0 || canEdit) && (
          <OwnerFeaturesCard
            grants={grantsRules}
            granted={{
              many: entityTypeLabel(ownedLists.grants?.references ?? "", rules?.words, true),
              type: ownedLists.grants?.references ?? "",
            }}
            words={rules?.words}
            positionWord={positionWord}
            rulesetId={rulesetId}
            ownedEntities={ownedEntities}
            readOnly={!canEdit}
            features={features}
            savedFeatures={savedFeatures}
            pools={pools}
            savedPools={savedPools}
            onFeatureGrantedAt={draft.setFeatureGrantedAt}
            onPoolPick={draft.setPoolPick}
            onAddFeature={draft.addFeature}
            onAddPool={draft.addPool}
            onRemoveFeature={draft.removeFeature}
            onRemovePool={draft.removePool}
            offers={readFeatureOffers(answer, grantsRules)}
            notes={notes}
            notesWaiting={sends && canEdit && (plan.isPending || plan.isPlaceholderData)}
            ownerId={ownerId}
            ownerType={ownerType}
            creating={createFeature.isPending}
            onCreateFeature={(name) => createFeature.mutate(name)}
          />
        )}
      {canEdit && ownedEntities.length > 0 && (
        <ProgressionSaveBar
          what="Progression"
          changes={changes}
          onDiscard={discard}
          onSave={handleSave}
          // Only a feature or pool added at no owned entity yet saves nothing: its Discard drops it
          canSave={Object.keys(body).length > 0}
          pending={save.isPending}
        />
      )}
      <CreateOwnedDialog
        open={createDialog.open}
        onClose={createDialog.close}
        form={createForm}
        onSubmit={handleCreateSubmit}
        pending={createOwned.isPending}
        baseRules={ruleset.baseRules}
        counts={listBatchCounts(open.length)}
        nextPositions={open}
        ownedType={ownedType}
        ownerName={ownerName}
        // Its levels send every amount: they wait for the entities they're of
        submitDisabled={!!ownedLists.amounts && !amountEntities}
        tracks={tracks.map((track) => ({
          describe: describeChoice(track),
          initial: batchDefaults[track.key],
          key: track.key,
          label: track.label,
          max: track.rules.max,
          min: track.rules.min,
          presets: presetsOf(track.rules),
          unitLabel: track.rules.unitLabel,
        }))}
      />
    </Stack>
  );
}
