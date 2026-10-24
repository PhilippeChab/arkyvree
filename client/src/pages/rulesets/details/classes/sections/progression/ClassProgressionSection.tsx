import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
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
import { LevelsIcon } from "@/client/src/components/icons/index.ts";
import { useRules, useRulesetPermissions } from "@/client/src/hooks/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { rulesetOptionsQuery } from "@/client/src/lib/queries.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import {
  levelColumnsOf,
  type LevelFormData,
  levelKeysOf,
  type LevelRead,
  nextLevel,
  readLevel,
  withEntityFields,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { levelPageOf } from "@/client/src/pages/rulesets/details/classes/classKind.ts";
import {
  classLevelsQuery,
  classProgressionQuery,
  classTableQuery,
} from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import type { ClassSectionProps } from "@/client/src/pages/rulesets/details/classes/classTab.ts";
import { CreateLevelDialog } from "@/client/src/pages/rulesets/details/classes/components/index.ts";
import { byLevel } from "@/client/src/pages/rulesets/details/classes/sections/byLevel.ts";
import { useClassCopy } from "@/client/src/pages/rulesets/details/classes/sections/useClassCopy.ts";
import { useEntityFields, useOpenEntity, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { buildCustomizationPath } from "@/shared/customization/entities.ts";
import { isRecord } from "@/shared/isRecord.ts";

import { CHANGED_CELL_SX } from "./changedCell.ts";
import { ClassFeaturesCard } from "./ClassFeaturesCard.tsx";
import {
  amountTrackKey,
  buildProgressionBody,
  describeFeatureRows,
  type PoolRow,
  readEditedTrack,
  readTrack,
  type TrackKey,
  withAddedFeatures,
  withAddedPools,
} from "./progressionDraft.ts";
import { detectPreset, formatTrackValue, presetsOf, type ProgressionTrack } from "./progressionPresets.ts";
import { ProgressionSaveBar } from "./ProgressionSaveBar.tsx";
import { ProgressionTrackRow } from "./ProgressionTrackRow.tsx";
import { useProgressionDraft } from "./useProgressionDraft.ts";
import { useProgressionSave } from "./useProgressionSave.ts";

/**
 * A track the tab edits: its key, its label (an entity's name, for a track of a level's amounts: 3.5's saves), and its
 * rules' track: its bounds, how its values read, and the progressions it can follow.
 */
interface Track {
  key: TrackKey;
  label: string;
  rules: ProgressionTrack;
}

/** A pool of a progression's answer, by the key its levels' grants hold one's id at (`viaKey`). */
function readPool(pool: unknown, viaKey: string | undefined): PoolRow[] {
  if (!isRecord(pool) || viaKey === undefined) return [];
  const { name, picks } = pool;
  const id = pool[viaKey];
  if (typeof id !== "string" || typeof name !== "string" || !isRecord(picks)) return [];
  return [{ id, name, picks: picks as PoolRow["picks"] }];
}

/**
 * A class's Progression tab: its table, the levels' tracks (3.5's base attack bonus, saves and skill points) and
 * features at once, which opens a level's page from its row; its progression, each track a preset to follow or its
 * levels to set; and its features and pools by level (3.5's feat pools; shown read-only to who can't edit). What it
 * changes waits for its save bar, which writes it all at once. Its levels are its rules' class kind's owned kind's,
 * their grants and amounts at their columns' keys.
 */
export function ClassProgressionSection({ rulesetId, classId, className, ruleset }: ClassSectionProps) {
  const openEntity = useOpenEntity(rulesetId);
  const queryClient = useQueryClient();
  const { rules } = useRules(ruleset.baseRules);
  const levelPage = levelPageOf(rules);
  const levelType = levelPage?.type ?? "";
  const levelColumns = levelColumnsOf(rules, levelType);
  const keys = levelKeysOf(levelColumns);
  const amountsType = levelColumns.amounts?.references ?? "";
  const owner = entityTypeLabel(levelPage?.owner ?? "", rules?.words).toLowerCase();
  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);
  // A level's amounts' entities, the ruleset's (3.5's saves); none read where its levels have no amounts
  const { data: amountEntities, error: amountsError } = useQuery(
    rulesetOptionsQuery(amountsType, levelColumns.amounts && rulesetId),
  );
  // Its tracks, a level's fields and its amounts, and what its levels grant, as its rules describe them
  const progressionRules = rules?.progression;
  const grantsRules = progressionRules?.grants;
  const trackRules = progressionRules?.tracks ?? [];
  const fieldKeys = trackRules.filter((track) => track.source === "field").map((track) => track.key);
  const { followCopy, queryKeysToInvalidate, tag } = useClassCopy(rulesetId, classId);

  const query = classLevelsQuery(rulesetId, classId);
  const { data: levelRows, isLoading, isFetching, error } = useQuery(query);
  const { data: progression, error: progressionError } = useQuery(classProgressionQuery(rulesetId, classId));
  // Its pools' totals, at the table its rules say; none read where its levels grant none past their columns
  const { data: poolTotals, error: poolsError } = useQuery(classTableQuery(rulesetId, classId, grantsRules?.table));
  const savedRows = (levelRows ?? []).toSorted(byLevel);
  const levels = savedRows.map((row) => readLevel(row, levelColumns));
  const savedFeatures = describeFeatureRows(levels);
  // Its pools, and the picks a granted entity gives in them, at the keys its rules say
  const answer: Record<string, unknown> | undefined = progression;
  const savedPools = (Array.isArray(answer?.pools) ? answer.pools : []).flatMap((pool) =>
    readPool(pool, keys.grants?.viaKey),
  );
  const picksOf = (entityId: string) => {
    const byEntity = answer?.[grantsRules?.picks ?? ""];
    const picks = isRecord(byEntity) ? byEntity[entityId] : undefined;
    return isRecord(picks) ? (picks as Record<string, number>) : {};
  };
  // A level's totals by pool name, at the key its rules say
  const poolTotalsAt = (levelId: string) => {
    const totals = poolTotals?.find((row) => row.id === levelId)?.[grantsRules?.totals ?? ""];
    return isRecord(totals) ? (totals as Record<string, number>) : undefined;
  };
  // Edits change something when they send something, or add a row a save hasn't made the class's yet
  const draft = useProgressionDraft(classId, levels, !isFetching, (edits) => {
    const body = buildProgressionBody(
      levels,
      keys,
      fieldKeys,
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
  const save = useProgressionSave(rulesetId, classId, levelType, "Progression");

  // Its create opens on the class's next level, its fields the highest's
  const { fields: levelFields } = useEntityFields(rulesetId, levelType);
  // A message's word for a level ("Class level")
  const levelWord = entityTypeLabel(levelType, rules?.words);
  const { createDialogProps, handleCreate } = useRulesetSection({
    createDefaults: withEntityFields(nextLevel(levels, keys), levelFields, savedRows.at(-1)),
    rulesetId,
    label: `${levelWord.charAt(0)}${levelWord.slice(1).toLowerCase()}`,
    query,
    data: levelRows,
    queryKeysToInvalidate,
    createFn: async (level: LevelFormData) =>
      tag(
        parseResponse(
          rpc.api.rulesets[":id"].entities[":entityType"][":entityId"].owned.$post({
            param: { id: rulesetId, entityType: "classes", entityId: classId },
            json: level,
          }),
        ),
      ),
    // The class the level was made on: the copy an edit of an inherited class made, at its owner's key
    onCreateSuccess: (created) => {
      const made: Record<string, unknown> = created;
      const ownerId = made[levelPage?.ownerKey ?? ""];
      followCopy(typeof ownerId === "string" ? ownerId : classId, created.sourceEntityId);
    },
  });

  const tracks = trackRules.flatMap((rules): Track[] =>
    rules.source === "amounts"
      ? (amountEntities ?? []).map((entity) => ({ key: amountTrackKey(entity.id), label: entity.name, rules }))
      : [{ key: rules.key, label: rules.label, rules }],
  );
  const valuesOf = (read: (level: LevelRead) => number) =>
    levels.map((level) => ({ level: level.level, levelId: level.id, value: read(level) }));

  const features = withAddedFeatures(savedFeatures, draft.edits).map((row) => ({
    ...row,
    levelIds: draft.edits.features[row.key] ?? row.levelIds,
  }));
  const pools = withAddedPools(savedPools, draft.edits).map((pool) => ({
    ...pool,
    picks: { ...pool.picks, ...draft.edits.pools[pool.id] },
  }));
  // What the tab changes each pool's total by at each level (by its name, then the level's id): the running difference
  // of its picks, and of the picks its features give where they're granted
  const poolChanges = new Map<string, Map<string, number>>();
  const addChanges = (name: string, changeAt: (levelId: string) => number) => {
    const byLevel = poolChanges.get(name) ?? new Map<string, number>();
    let change = 0;
    for (const { id } of levels) {
      change += changeAt(id);
      byLevel.set(id, (byLevel.get(id) ?? 0) + change);
    }
    poolChanges.set(name, byLevel);
  };
  for (const pool of pools) {
    const saved = savedPools.find((s) => s.id === pool.id)?.picks ?? {};
    addChanges(pool.name, (id) => (pool.picks[id] ?? 0) - (saved[id] ?? 0));
  }
  for (const row of features) {
    const saved = savedFeatures.find((s) => s.key === row.key)?.levelIds ?? [];
    const granted = (id: string) => Number(row.levelIds.includes(id)) - Number(saved.includes(id));
    for (const [name, picks] of Object.entries(picksOf(row.entityId))) addChanges(name, (id) => granted(id) * picks);
  }
  const poolNames = [
    ...new Set([
      ...(poolTotals ?? []).flatMap((row) => Object.keys(poolTotalsAt(row.id) ?? {})),
      ...[...poolChanges].filter(([, byLevel]) => [...byLevel.values()].some(Boolean)).map(([name]) => name),
    ]),
  ].sort();

  const body = buildProgressionBody(
    levels,
    keys,
    fieldKeys,
    amountEntities?.map(({ id }) => id),
    savedFeatures,
    savedPools,
    draft.edits,
  );
  // A pool's id in the save, at the key its levels' grants hold one at
  const poolIdOf = (pool: Record<string, unknown>) => String(pool[keys.grants?.viaKey ?? ""]);
  const changes = [
    ...tracks.flatMap((track) => {
      const before = valuesOf((level) => readTrack(level, track.key));
      const after = valuesOf((level) => readEditedTrack(level, track.key, draft.edits));
      const changed = after.filter(({ value }, index) => value !== before[index].value).length;
      if (changed === 0) return [];
      const constant = (values: typeof before) => values.every(({ value }) => value === values[0].value);
      const plain = constant(before) && constant(after) ? [String(before[0].value), `${after[0].value} a level`] : [];
      const presets = presetsOf(track.rules);
      const [from, to] =
        presets.length > 0
          ? [detectPreset(presets, before)?.label ?? "Custom", detectPreset(presets, after)?.label ?? "Custom"]
          : plain;
      const how = from !== to ? `${from} → ${to}, ` : "";
      return [{ key: track.key, label: `${track.label}: ${how}${formatCount(changed, "level")}` }];
    }),
    ...features.flatMap((row) => {
      const saved = savedFeatures.find((s) => s.key === row.key)?.levelIds ?? [];
      const changed = levels.filter(({ id }) => row.levelIds.includes(id) !== saved.includes(id)).length;
      return changed > 0 ? [{ key: row.key, label: `${row.name}: ${formatCount(changed, "level")}` }] : [];
    }),
    // A feature or pool added and given no level yet saves nothing, but shows, so its Discard can drop it
    ...features
      .filter((row) => row.levelIds.length === 0 && !savedFeatures.some((s) => s.key === row.key))
      .map((row) => ({ key: `added:${row.key}`, label: `${row.name}: added, at no level yet` })),
    ...pools
      .filter((pool) => !savedPools.some((s) => s.id === pool.id))
      .filter((pool) => !Object.values(pool.picks).some((count) => count > 0))
      .map((pool) => ({ key: `added:${pool.id}`, label: `${pool.name}: added, at no level yet` })),
    ...(body.pools ?? []).map((pool) => {
      const name = pools.find((p) => p.id === poolIdOf(pool))?.name;
      return {
        key: `pool:${poolIdOf(pool)}`,
        label: `${name}: ${formatCount(pool.picks.length, "level")}`,
      };
    }),
  ];

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
        // Refused (its levels changed since), it's sent again over them as they're read again
        onError: draft.forgetTokens,
      },
    );
  };

  const descriptionByEntity = new Map(
    levels.flatMap((level) => level.grants.map((grant) => [grant.entityId, grant.description])),
  );
  const featuresAt = (levelId: string) => features.filter((row) => row.levelIds.includes(levelId));
  const columns = [
    { key: "level", label: "Level", width: "8%" },
    ...tracks.map((track) => ({ key: track.key, label: track.rules.shortLabel ?? track.label, width: "9%" })),
    ...poolNames.map((name) => ({ key: `pool:${name}`, label: name, width: "7%" })),
    // The rest of the table's width, however many tracks and pools it has
    { key: "special", label: progressionRules?.grantsLabel ?? "", slot: "block" as const },
  ];

  const renderCell = (level: LevelRead, columnKey: string) => {
    if (columnKey === "level") return <ValueChip label={level.level} color="primary" />;
    if (columnKey.startsWith("pool:")) {
      const name = columnKey.slice(5);
      const saved = poolTotalsAt(level.id)?.[name];
      const change = poolChanges.get(name)?.get(level.id) ?? 0;
      const total = change === 0 ? saved : (saved ?? 0) + change;
      return (
        <Typography variant="body2" sx={[change !== 0 && CHANGED_CELL_SX]}>
          {total ?? <EmptyValue />}
        </Typography>
      );
    }
    if (columnKey === "special") {
      const granted = featuresAt(level.id);
      const suffix = ` (${className})`;
      return granted.length > 0 ? (
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
          {granted.map((row) => (
            <Tooltip
              describeChild
              key={row.key}
              title={descriptionByEntity.get(row.entityId) || row.viaName || ""}
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
    const value = readEditedTrack(level, track.key, draft.edits);
    const changed = value !== readTrack(level, track.key);
    return (
      <Typography variant="body2" sx={[changed && CHANGED_CELL_SX]}>
        {formatTrackValue(track.rules, value)}
      </Typography>
    );
  };

  return (
    <Stack spacing={3}>
      {canEdit && <ListToolbar actions={<AddButton label="Add Level" onClick={handleCreate} />} />}
      {!!amountsError && !amountEntities && (
        <LoadError what={entityTypeLabel(amountsType, rules?.words, true)} error={amountsError} />
      )}
      {!!progressionError && !progression && (
        <LoadError what={grantsRules?.words.pools ?? ""} error={progressionError} />
      )}
      {!!poolsError && !poolTotals && <LoadError what={grantsRules?.words.totals ?? ""} error={poolsError} />}
      <RulesetSectionTable
        what="Levels"
        error={error}
        data={levelRows ? levels : undefined}
        isLoading={isLoading}
        columns={columns}
        onRowClick={(level) => openEntity(buildCustomizationPath(levelType, level.id))}
        onRowPrefetch={(level) =>
          void queryClient.prefetchQuery(customizationEntityQuery(rulesetId, levelPage, level.id))
        }
        renderCell={renderCell}
        empty={
          <BlankState
            icon={LevelsIcon}
            title="No levels"
            description={
              canEdit
                ? `Start by adding the first level for this ${owner}.`
                : `This ${owner} doesn't have any levels defined yet.`
            }
          />
        }
      />
      {canEdit && levels.length > 0 && (
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
                custom={customTracks.includes(track.key)}
                onCustomChange={(open) =>
                  setCustomTracks((current) => [
                    ...current.filter((key) => key !== track.key),
                    ...(open ? [track.key] : []),
                  ])
                }
                format={(value) => formatTrackValue(track.rules, value)}
                presets={track.rules.presets.length > 0 ? presetsOf(track.rules) : undefined}
                saved={valuesOf((level) => readTrack(level, track.key))}
                values={valuesOf((level) => readEditedTrack(level, track.key, draft.edits))}
                onChange={(values) =>
                  draft.setTrack(
                    track.key,
                    Object.fromEntries(
                      // A value as saved stays, past the bound or not (a Revert's)
                      Object.entries(values).map(([levelId, value]) => {
                        const level = levels.find(({ id }) => id === levelId);
                        const saved = level && readTrack(level, track.key);
                        return [levelId, value === saved ? value : Math.min(value, track.rules.max)];
                      }),
                    ),
                  )
                }
              />
            ))}
          </Box>
        </Panel>
      )}
      {/* Its pools wait for the class's progression, so a pool it has can't be added again */}
      {levels.length > 0 &&
        progression &&
        grantsRules &&
        levelColumns.grants &&
        (features.length > 0 || pools.length > 0 || canEdit) && (
          <ClassFeaturesCard
            grants={grantsRules}
            granted={{
              many: entityTypeLabel(levelColumns.grants?.references ?? "", rules?.words, true),
              type: levelColumns.grants?.references ?? "",
            }}
            words={rules?.words}
            rulesetId={rulesetId}
            levels={levels}
            readOnly={!canEdit}
            features={features}
            savedFeatures={savedFeatures}
            pools={pools}
            savedPools={savedPools}
            onFeatureLevels={draft.setFeatureLevels}
            onPoolPick={draft.setPoolPick}
            onAddFeature={draft.addFeature}
            onAddPool={draft.addPool}
          />
        )}
      {canEdit && levels.length > 0 && (
        <ProgressionSaveBar
          what="Progression"
          changes={changes}
          onDiscard={discard}
          onSave={handleSave}
          // Only a feature or pool added at no level yet saves nothing: its Discard drops it
          canSave={Object.keys(body).length > 0}
          pending={save.isPending}
        />
      )}
      <CreateLevelDialog
        {...createDialogProps}
        rulesetId={rulesetId}
        baseRules={ruleset.baseRules}
        columns={levelColumns}
        levelType={levelType}
      />
    </Stack>
  );
}
