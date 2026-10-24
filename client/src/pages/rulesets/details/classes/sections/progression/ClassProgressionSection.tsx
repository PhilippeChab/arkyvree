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
import { useCustomizationPages, useRules, useRulesetPermissions } from "@/client/src/hooks/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { nextClassLevel, withEntityFields } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import {
  classFeatPoolsQuery,
  type ClassLevelFormData,
  type ClassLevelRow,
  classLevelsQuery,
  classProgressionQuery,
} from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import type { ClassSectionProps } from "@/client/src/pages/rulesets/details/classes/classTab.ts";
import { CreateLevelDialog } from "@/client/src/pages/rulesets/details/classes/components/index.ts";
import { byLevel } from "@/client/src/pages/rulesets/details/classes/sections/byLevel.ts";
import { useClassCopy } from "@/client/src/pages/rulesets/details/classes/sections/useClassCopy.ts";
import {
  useEntityFields,
  useOpenEntity,
  useRulesetSaves,
  useRulesetSection,
} from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { buildCustomizationPath } from "@/shared/customization/entities.ts";

import { CHANGED_CELL_SX } from "./changedCell.ts";
import { ClassFeaturesCard } from "./ClassFeaturesCard.tsx";
import {
  buildProgressionBody,
  describeFeatureRows,
  readEditedTrack,
  readTrack,
  saveTrackKey,
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
 * A track the tab edits: its key, its label (a save's name, for a track of the ruleset's saves), and its rules' track:
 * its bounds, how its values read, and the progressions it can follow.
 */
interface Track {
  key: TrackKey;
  label: string;
  rules: ProgressionTrack;
}

/**
 * A class's Progression tab: its table, the levels' tracks (3.5's base attack bonus, saves and skill points) and
 * features at once, which opens a level's page from its row; its progression, each track a preset to follow or its
 * levels to set; and its features and feat pools by level (shown read-only to who can't edit). What it changes waits
 * for its save bar, which writes it all at once.
 */
export function ClassProgressionSection({ rulesetId, classId, className, ruleset }: ClassSectionProps) {
  const openEntity = useOpenEntity(rulesetId);
  const queryClient = useQueryClient();
  const levelPage = useCustomizationPages().get("klass_levels");
  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);
  const { data: rulesetSaves, error: savesError } = useRulesetSaves(rulesetId);
  // Its tracks, a level's fields and its saves, as its rules describe them
  const progressionRules = useRules(ruleset.baseRules).rules?.progression;
  const trackRules = progressionRules?.tracks ?? [];
  const fieldKeys = trackRules.filter((track) => track.source === "field").map((track) => track.key);
  const { followCopy, queryKeysToInvalidate, tag } = useClassCopy(rulesetId, classId);

  const query = classLevelsQuery(rulesetId, classId);
  const { data: levelRows, isLoading, isFetching, error } = useQuery(query);
  const { data: progression, error: progressionError } = useQuery(classProgressionQuery(rulesetId, classId));
  const { data: poolTotals, error: poolsError } = useQuery(classFeatPoolsQuery(rulesetId, classId));
  const levels = levelRows?.toSorted(byLevel) ?? [];
  const savedFeatures = describeFeatureRows(levels);
  const savedPools = progression?.pools ?? [];
  // Edits change something when they send something, or add a row a save hasn't made the class's yet
  const draft = useProgressionDraft(classId, levels, !isFetching, (edits) => {
    const body = buildProgressionBody(
      levels,
      fieldKeys,
      rulesetSaves?.map(({ id }) => id),
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
  const save = useProgressionSave(rulesetId, classId, "Progression");

  // Its create opens on the class's next level, its fields the highest's
  const { fields: levelFields } = useEntityFields(rulesetId, "klass_levels");
  const { createDialogProps, handleCreate } = useRulesetSection({
    createDefaults: withEntityFields(nextClassLevel(levels), levelFields, levels.at(-1)),
    rulesetId,
    label: "Class level",
    query,
    data: levelRows,
    queryKeysToInvalidate,
    createFn: async (level: ClassLevelFormData) =>
      tag(
        parseResponse(
          rpc.api.rulesets[":id"].entities[":entityType"][":entityId"].owned.$post({
            param: { id: rulesetId, entityType: "classes", entityId: classId },
            json: level,
          }),
        ),
      ),
    onCreateSuccess: (created) => followCopy(created.klassId, created.sourceEntityId),
  });

  const saves = rulesetSaves ?? [];
  const tracks = trackRules.flatMap((rules): Track[] =>
    rules.source === "amounts"
      ? saves.map((save) => ({ key: saveTrackKey(save.id), label: save.name, rules }))
      : [{ key: rules.key, label: rules.label, rules }],
  );
  const valuesOf = (read: (level: ClassLevelRow) => number) =>
    levels.map((level) => ({ level: level.level, levelId: level.id, value: read(level) }));

  const features = withAddedFeatures(savedFeatures, draft.edits).map((row) => ({
    ...row,
    levelIds: draft.edits.features[row.key] ?? row.levelIds,
  }));
  const pools = withAddedPools(savedPools, draft.edits).map((pool) => ({
    ...pool,
    picks: { ...pool.picks, ...draft.edits.pools[pool.aptitudeId] },
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
    const saved = savedPools.find((s) => s.aptitudeId === pool.aptitudeId)?.picks ?? {};
    addChanges(pool.name, (id) => (pool.picks[id] ?? 0) - (saved[id] ?? 0));
  }
  for (const row of features) {
    const saved = savedFeatures.find((s) => s.key === row.key)?.levelIds ?? [];
    const granted = (id: string) => Number(row.levelIds.includes(id)) - Number(saved.includes(id));
    for (const [name, picks] of Object.entries(progression?.featPicks[row.featId] ?? {}))
      addChanges(name, (id) => granted(id) * picks);
  }
  const poolNames = [
    ...new Set([
      ...(poolTotals ?? []).flatMap((level) => Object.keys(level.featPools)),
      ...[...poolChanges].filter(([, byLevel]) => [...byLevel.values()].some(Boolean)).map(([name]) => name),
    ]),
  ].sort();

  const body = buildProgressionBody(
    levels,
    fieldKeys,
    rulesetSaves?.map(({ id }) => id),
    savedFeatures,
    savedPools,
    draft.edits,
  );
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
      .filter((pool) => !savedPools.some((s) => s.aptitudeId === pool.aptitudeId))
      .filter((pool) => !Object.values(pool.picks).some((count) => count > 0))
      .map((pool) => ({ key: `added:${pool.aptitudeId}`, label: `${pool.name}: added, at no level yet` })),
    ...(body.pools ?? []).map((pool) => {
      const name = pools.find((p) => p.aptitudeId === pool.aptitudeId)?.name;
      return {
        key: `pool:${pool.aptitudeId}`,
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

  const descriptionByFeat = new Map(levels.flatMap((level) => level.feats.map((feat) => [feat.id, feat.description])));
  const featuresAt = (levelId: string) => features.filter((row) => row.levelIds.includes(levelId));
  const columns = [
    { key: "level", label: "Level", width: "8%" },
    ...tracks.map((track) => ({ key: track.key, label: track.rules.shortLabel ?? track.label, width: "9%" })),
    ...poolNames.map((name) => ({ key: `pool:${name}`, label: name, width: "7%" })),
    // The rest of the table's width, however many tracks and pools it has
    { key: "special", label: progressionRules?.grantsLabel ?? "", slot: "block" as const },
  ];

  const renderCell = (level: ClassLevelRow, columnKey: string) => {
    if (columnKey === "level") return <ValueChip label={level.level} color="primary" />;
    if (columnKey.startsWith("pool:")) {
      const name = columnKey.slice(5);
      const saved = poolTotals?.find((row) => row.id === level.id)?.featPools[name];
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
              title={descriptionByFeat.get(row.featId) || row.aptitudeName || ""}
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
      {!!savesError && !rulesetSaves && <LoadError what="Saves" error={savesError} />}
      {!!progressionError && !progression && <LoadError what="Feat pools" error={progressionError} />}
      {!!poolsError && !poolTotals && <LoadError what="Feat pool totals" error={poolsError} />}
      <RulesetSectionTable
        what="Levels"
        error={error}
        data={levelRows ? levels : undefined}
        isLoading={isLoading}
        columns={columns}
        onRowClick={(level) => openEntity(buildCustomizationPath("klass_levels", level.id))}
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
                ? "Start by adding the first level for this class."
                : "This class doesn't have any levels defined yet."
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
      {levels.length > 0 && progression && (features.length > 0 || pools.length > 0 || canEdit) && (
        <ClassFeaturesCard
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
      <CreateLevelDialog {...createDialogProps} rulesetId={rulesetId} baseRules={ruleset.baseRules} />
    </Stack>
  );
}
