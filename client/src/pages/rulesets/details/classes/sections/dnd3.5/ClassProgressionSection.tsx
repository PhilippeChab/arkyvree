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
import { useRulesetPermissions } from "@/client/src/hooks/index.ts";
import { withEntityFields } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { getClassForms } from "@/client/src/pages/rulesets/details/classes/classFormFactory.ts";
import type { ClassSectionProps } from "@/client/src/pages/rulesets/details/classes/classSectionFactory.ts";
import {
  classFeatPoolsQuery,
  type ClassLevelFormData,
  type ClassLevelRow,
  classLevelsQuery,
  classProgressionQuery,
} from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
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
import { formatSigned } from "@/shared/text.ts";
import { MAX_SAVE_BASE } from "@/vocabulary/dnd3.5/classes.ts";

import { ClassFeaturesCard } from "./ClassFeaturesCard.tsx";
import {
  buildProgressionBody,
  describeFeatureRows,
  describePoolRows,
  readEditedTrack,
  readTrack,
  type TrackKey,
} from "./progressionDraft.ts";
import { BAB_PRESETS, detectPreset, formatBab, type ProgressionPreset, SAVE_PRESETS } from "./progressionPresets.ts";
import { ProgressionSaveBar } from "./ProgressionSaveBar.tsx";
import { ProgressionTrackRow } from "./ProgressionTrackRow.tsx";
import { useProgressionDraft } from "./useProgressionDraft.ts";
import { useProgressionSave } from "./useProgressionSave.ts";

/** A track the tab edits: its key, its label, how its values read, and the progressions it can follow. */
interface Track {
  format: (value: number) => string;
  key: TrackKey;
  label: string;
  /** The highest value the rules take, which a value past it is set back to (a save's base) */
  max?: number;
  presets?: readonly ProgressionPreset[];
}

/** A table cell the tab changed before its save. */
const CHANGED_CELL_SX = {
  fontWeight: 600,
  color: "secondary.dark",
  bgcolor: "action.selected",
  px: 0.5,
  borderRadius: 0.5,
} as const;

/**
 * A class's Progression tab: its table, the levels' base attack bonus, saves, skill points and features at once, which
 * opens a level's page from its row; its progression, each track a preset to follow or its levels to set; and its
 * features and feat pools by level (shown read-only to who can't edit). What it changes waits for its save bar, which
 * writes it all at once.
 */
export function ClassProgressionSection({ rulesetId, classId, className, ruleset }: ClassSectionProps) {
  const openEntity = useOpenEntity(rulesetId);
  const queryClient = useQueryClient();
  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);
  const { data: rulesetSaves, error: savesError } = useRulesetSaves(rulesetId);
  const { followCopy, queryKeysToInvalidate, tag } = useClassCopy(rulesetId, classId);

  const query = classLevelsQuery(rulesetId, classId);
  const { data: levelRows, isLoading, error } = useQuery(query);
  const { data: progression, error: progressionError } = useQuery(classProgressionQuery(rulesetId, classId));
  const { data: poolTotals, error: poolsError } = useQuery(classFeatPoolsQuery(rulesetId, classId));
  const levels = levelRows?.toSorted(byLevel) ?? [];
  const draft = useProgressionDraft(classId, levels);
  const [customTracks, setCustomTracks] = useState<TrackKey[]>([]);
  const save = useProgressionSave(rulesetId, classId);

  // Its create opens on the class's next level, its fields the highest's
  const { fields: levelFields } = useEntityFields(rulesetId, "klass_levels");
  const { createDialogProps, handleCreate } = useRulesetSection({
    createDefaults: withEntityFields(
      getClassForms(ruleset.baseRules).nextClassLevel(levels),
      levelFields,
      levels.at(-1),
    ),
    rulesetId,
    label: "Class level",
    query,
    data: levelRows,
    queryKeysToInvalidate,
    createFn: async (level: ClassLevelFormData) =>
      tag(
        parseResponse(
          rpc.api.rulesets[":id"].classes[":classId"].levels.$post({ param: { id: rulesetId, classId }, json: level }),
        ),
      ),
    onCreateSuccess: (created) => followCopy(created.klassId, created.sourceEntityId),
  });

  const saves = rulesetSaves ?? [];
  const tracks: Track[] = [
    { key: "bab", label: "Base Attack Bonus", format: formatBab, presets: BAB_PRESETS },
    ...saves.map((save): Track => ({
      key: `save:${save.id}`,
      label: save.name,
      format: formatSigned,
      max: MAX_SAVE_BASE,
      presets: SAVE_PRESETS,
    })),
    { key: "skills", label: "Skill Points", format: String },
  ];
  const valuesOf = (read: (level: ClassLevelRow) => number) =>
    levels.map((level) => ({ level: level.level, levelId: level.id, value: read(level) }));

  const savedFeatures = describeFeatureRows(levels);
  const features = [...savedFeatures, ...draft.edits.addedFeatures].map((row) => ({
    ...row,
    levelIds: draft.edits.features[row.key] ?? row.levelIds,
  }));
  const savedPools = describePoolRows(progression);
  const pools = [...savedPools, ...draft.edits.addedPools].map((pool) => ({
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
      const [from, to] = track.presets
        ? [
            detectPreset(track.presets, before)?.label ?? "Custom",
            detectPreset(track.presets, after)?.label ?? "Custom",
          ]
        : plain;
      const how = from !== to ? `${from} → ${to}, ` : "";
      return [{ key: track.key, label: `${track.label}: ${how}${changed} ${changed === 1 ? "level" : "levels"}` }];
    }),
    ...features.flatMap((row) => {
      const saved = savedFeatures.find((s) => s.key === row.key)?.levelIds ?? [];
      const changed = levels.filter(({ id }) => row.levelIds.includes(id) !== saved.includes(id)).length;
      return changed > 0
        ? [{ key: row.key, label: `${row.name}: ${changed} ${changed === 1 ? "level" : "levels"}` }]
        : [];
    }),
    ...(body.pools ?? []).map((pool) => {
      const name = pools.find((p) => p.aptitudeId === pool.aptitudeId)?.name;
      return {
        key: `pool:${pool.aptitudeId}`,
        label: `${name}: ${pool.picks.length} ${pool.picks.length === 1 ? "level" : "levels"}`,
      };
    }),
  ];

  // Its edits, and the tracks' editors they were made in
  const discard = () => {
    draft.discard();
    setCustomTracks([]);
  };
  const handleSave = () => save.mutate({ ...body, ...draft.tokens() }, { onSuccess: discard });

  const descriptionByFeat = new Map(levels.flatMap((level) => level.feats.map((feat) => [feat.id, feat.description])));
  const featuresAt = (levelId: string) => features.filter((row) => row.levelIds.includes(levelId));
  const columns = [
    { key: "level", label: "Level", width: "8%" },
    ...tracks.map((track) => ({ key: track.key, label: track.key === "bab" ? "BAB" : track.label, width: "9%" })),
    ...poolNames.map((name) => ({ key: `pool:${name}`, label: name, width: "7%" })),
    // The rest of the table's width, however many tracks and pools it has
    { key: "special", label: "Special", slot: "block" as const },
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
        {track.format(value)}
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
          void queryClient.prefetchQuery(customizationEntityQuery(rulesetId, "klass_levels", level.id))
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
                custom={customTracks.includes(track.key)}
                onCustomChange={(open) =>
                  setCustomTracks((current) => [
                    ...current.filter((key) => key !== track.key),
                    ...(open ? [track.key] : []),
                  ])
                }
                format={track.format}
                presets={track.presets}
                saved={valuesOf((level) => readTrack(level, track.key))}
                values={valuesOf((level) => readEditedTrack(level, track.key, draft.edits))}
                onChange={(values) =>
                  draft.setTrack(
                    track.key,
                    Object.fromEntries(
                      Object.entries(values).map(([levelId, value]) => [levelId, Math.min(value, track.max ?? value)]),
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
          pending={save.isPending}
        />
      )}
      <CreateLevelDialog {...createDialogProps} rulesetId={rulesetId} baseRules={ruleset.baseRules} />
    </Stack>
  );
}
