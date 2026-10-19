import { Autocomplete, Button, Stack, TextField, Typography } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  BlankState,
  DiceSpinner,
  LoadError,
  OptionToggle,
  Panel,
  ScrollSafeListbox,
} from "@/client/src/components/common/index.ts";
import { SpellUsesIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDebouncedValue, useListboxQuery, useRulesetPermissions } from "@/client/src/hooks/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import type { ClassSectionProps } from "@/client/src/pages/rulesets/details/classes/classSectionFactory.ts";
import {
  classProgressionQuery,
  classSpellsKnownQuery,
  classSpellsPerDayQuery,
} from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import { byLevel } from "@/client/src/pages/rulesets/details/classes/sections/byLevel.ts";
import { classOptionsQuery } from "@/client/src/pages/rulesets/optionQueries.ts";
import { SPELL_LEVELS } from "@/vocabulary/dnd3.5/spells.ts";

import { ProgressionSaveBar } from "./ProgressionSaveBar.tsx";
import { type PlacedCell, type SpellCell } from "./spellPaste.ts";
import { SpellPasteBox } from "./SpellPasteBox.tsx";
import { SpellTableGrid } from "./SpellTableGrid.tsx";
import { useClassDraft } from "./useClassDraft.ts";
import { useProgressionSave } from "./useProgressionSave.ts";

/** A table's level as its query reads it: its totals by spell level ("All" for spells known's every spell). */
interface SpellLevelRow {
  id: string;
  level: number;
  totals: Record<string, number | "All">;
}

/** A table's cells the tab changed and hasn't saved: by level id, then by spell level. */
type SpellEdits = Record<SpellTable, Record<string, Record<number, SpellCell>>>;

/** The spell tables a class has: its spells per day and its spells known (the spells it picks). */
type SpellTable = "known" | "perDay";

/** A tab that changed nothing yet. */
const NO_SPELL_EDITS: SpellEdits = { known: {}, perDay: {} };

/** Each table's label, as its toggle and its save bar name it. */
const TABLE_LABELS: Record<SpellTable, string> = { perDay: "Spells per Day", known: "Spells Known" };

/** A total as a cell holds it: none, a count, or "all". */
function toCell(total: number | "All" | undefined): SpellCell {
  if (total === undefined) return null;
  return total === "All" ? "all" : total;
}

/**
 * A class's Spells tab: its spells per day and its spells known (how many spells it picks at each spell level), each
 * a grid of the totals the book prints, edited in place, filled from another class's table or emptied, or from a
 * pasted table; one save writes both. A class with no spell list casts none, which its editor is told how to change.
 */
export function ClassSpellsSection({ rulesetId, classId, className, ruleset }: ClassSectionProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);
  const [table, setTable] = useState<SpellTable>("perDay");
  const [pasting, setPasting] = useState(false);
  const [classSearch, setClassSearch] = useState("");

  const perDay = useQuery(classSpellsPerDayQuery(rulesetId, classId));
  const known = useQuery(classSpellsKnownQuery(rulesetId, classId));
  const { data: progression, error: progressionError } = useQuery(classProgressionQuery(rulesetId, classId));
  // An editor's, of a class with one spell list: its classes to start from are only read then
  const editable = canEdit && !!progression?.spellList && !progression.severalSpellLists;
  const classes = useListboxQuery({
    ...classOptionsQuery(rulesetId, useDebouncedValue(classSearch)),
    enabled: editable,
  });

  const perDayRows = (rows: NonNullable<typeof perDay.data>): SpellLevelRow[] =>
    rows.map((row) => ({ id: row.id, level: row.level, totals: row.spellsPerDay }));
  const knownRows = (rows: NonNullable<typeof known.data>): SpellLevelRow[] =>
    rows.map((row) => ({ id: row.id, level: row.level, totals: row.spellsKnown }));
  const rowsOf: Record<SpellTable, SpellLevelRow[]> = {
    perDay: perDayRows(perDay.data ?? []),
    known: knownRows(known.data ?? []),
  };
  const levels = (perDay.data ?? []).toSorted(byLevel);
  const save = useProgressionSave(rulesetId, classId);
  const { discard, edits, setEdits, tokens } = useClassDraft<SpellEdits>(classId, levels, NO_SPELL_EDITS);
  const totalsById: Record<SpellTable, Map<string, SpellLevelRow["totals"]>> = {
    perDay: new Map(rowsOf.perDay.map((row) => [row.id, row.totals])),
    known: new Map(rowsOf.known.map((row) => [row.id, row.totals])),
  };
  const savedCell = (which: SpellTable, levelId: string, spellLevel: number) =>
    toCell(totalsById[which].get(levelId)?.[spellLevel]);
  // A cell as edits hold it (`state`): an emptied cell's edit is `null`, which holds over the saved value as a count does
  const editedCell = (state: SpellEdits, which: SpellTable, levelId: string, spellLevel: number) => {
    const row = state[which][levelId];
    return row && spellLevel in row ? row[spellLevel] : savedCell(which, levelId, spellLevel);
  };
  const indexById = new Map(levels.map((level, index) => [level.id, index]));
  /** Each spell level's first level whose spells known are all of them, as edits (`state`) hold them: -1 for none. */
  const firstAllOf = (state: SpellEdits) =>
    SPELL_LEVELS.map((spellLevel) =>
      levels.findIndex(({ id }) => editedCell(state, "known", id, spellLevel) === "all"),
    );
  // A cell as the table shows it (`firstAll`, `state`'s): every spell known, once a level knows them all, stays known
  const shownCell = (
    state: SpellEdits,
    firstAll: number[],
    which: SpellTable,
    levelId: string,
    spellLevel: number,
  ): SpellCell => {
    const cell = editedCell(state, which, levelId, spellLevel);
    const allFrom = firstAll[spellLevel] ?? -1;
    return which === "known" && allFrom !== -1 && (indexById.get(levelId) ?? 0) > allFrom ? "all" : cell;
  };
  const firstAll = firstAllOf(edits);
  const cellOf = (which: SpellTable, levelId: string, spellLevel: number) =>
    shownCell(edits, firstAll, which, levelId, spellLevel);
  const changedCells = (which: SpellTable) =>
    levels.flatMap(({ id }) =>
      SPELL_LEVELS.filter((spellLevel) => cellOf(which, id, spellLevel) !== savedCell(which, id, spellLevel)),
    ).length;

  /** Edits (`state`) once a table's `cells` are written: on Spells Known, a cell under an All keeps no edit of its own. */
  const writeCells = (state: SpellEdits, which: SpellTable, cells: PlacedCell[]): SpellEdits => {
    const next = { ...state[which] };
    for (const { levelId, spellLevel, value } of cells) next[levelId] = { ...next[levelId], [spellLevel]: value };
    const written = { ...state, [which]: next };
    if (which === "perDay") return written;
    for (const spellLevel of SPELL_LEVELS) {
      let known = false;
      for (const { id } of levels) {
        if (known && next[id] && spellLevel in next[id]) {
          const row = { ...next[id] };
          delete row[spellLevel];
          next[id] = row;
        }
        known ||= editedCell(written, which, id, spellLevel) === "all";
      }
    }
    return written;
  };
  const setCells = (which: SpellTable, cells: PlacedCell[]) => setEdits((current) => writeCells(current, which, cells));
  /** The cells of a paste that change the table as it shows. */
  const changesOf = (cells: PlacedCell[]) => {
    const next = writeCells(edits, table, cells);
    const nextAll = firstAllOf(next);
    return cells.filter(
      ({ levelId, spellLevel }) =>
        shownCell(next, nextAll, table, levelId, spellLevel) !== cellOf(table, levelId, spellLevel),
    );
  };

  /** Another class's table, the one the tab shows: none for no class. */
  const readTable = async (otherId: string | undefined): Promise<SpellLevelRow[]> => {
    if (!otherId) return [];
    return table === "perDay"
      ? perDayRows(await queryClient.fetchQuery(classSpellsPerDayQuery(rulesetId, otherId)))
      : knownRows(await queryClient.fetchQuery(classSpellsKnownQuery(rulesetId, otherId)));
  };

  /** Every cell of the table from another class's, by level number: none where it has none. */
  const startFrom = async (otherId: string | undefined) => {
    let other: SpellLevelRow[];
    try {
      other = await readTable(otherId);
    } catch (error) {
      snackbar.error(error, "Failed to load the class's table");
      return;
    }
    const totalsAt = (level: number) => other.find((row) => row.level === level)?.totals;
    setCells(
      table,
      levels.flatMap(({ id, level }) =>
        SPELL_LEVELS.map((spellLevel) => ({ levelId: id, spellLevel, value: toCell(totalsAt(level)?.[spellLevel]) })),
      ),
    );
  };

  const changes = editable
    ? (["perDay", "known"] as const).flatMap((which) => {
        const count = changedCells(which);
        return count > 0
          ? [{ key: which, label: `${TABLE_LABELS[which]}: ${count} ${count === 1 ? "cell" : "cells"}` }]
          : [];
      })
    : [];

  const rowsBody = (which: SpellTable) =>
    levels.flatMap(({ id }) =>
      SPELL_LEVELS.some((spellLevel) => cellOf(which, id, spellLevel) !== savedCell(which, id, spellLevel))
        ? [{ levelId: id, counts: SPELL_LEVELS.map((spellLevel) => cellOf(which, id, spellLevel)) }]
        : [],
    );
  const handleSave = () => {
    // Per day takes no "all": a typed one is no count
    const perDayRows = rowsBody("perDay").map(({ levelId, counts }) => ({
      levelId,
      counts: counts.map((count) => (count === "all" ? null : count)),
    }));
    const knownRows = rowsBody("known");
    save.mutate(
      {
        ...tokens(),
        spells: {
          ...(perDayRows.length > 0 && { perDay: perDayRows }),
          ...(knownRows.length > 0 && { known: knownRows }),
        },
      },
      { onSuccess: discard },
    );
  };

  if (perDay.isLoading || known.isLoading) return <DiceSpinner sx={{ py: 4 }} />;
  const failed = (perDay.error && !perDay.data && perDay.error) || (known.error && !known.data && known.error);
  if (failed) return <LoadError what="Spells" error={failed} />;
  if (levels.length === 0) {
    return (
      <BlankState icon={SpellUsesIcon} title="No levels" description="Add levels to the class to give it spells." />
    );
  }
  if (progression && !progression.spellList) {
    return (
      <BlankState
        icon={SpellUsesIcon}
        title="No spells"
        description={
          canEdit
            ? `${className} has no spell list. Add an aptitude named "${className} Spells" to give it spells.`
            : `${className} casts no spells.`
        }
      />
    );
  }

  return (
    <Stack spacing={3}>
      <Panel spacing={2}>
        <Stack
          direction="row"
          spacing={2}
          useFlexGap
          sx={{ flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}
        >
          <OptionToggle
            label="Table"
            value={table}
            onChange={setTable}
            options={(["perDay", "known"] as const).map((which) => ({
              label: `${TABLE_LABELS[which]}${changedCells(which) > 0 ? " •" : ""}`,
              value: which,
            }))}
          />
          {editable && (
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
              <Autocomplete
                size="small"
                options={classes.items.filter((klass) => klass.id !== classId)}
                getOptionLabel={(klass) => klass.name}
                value={null}
                onChange={(_, klass) => klass && void startFrom(klass.id)}
                onInputChange={(_, input, reason) => {
                  if (reason === "input") setClassSearch(input);
                }}
                filterOptions={(options) => options}
                loading={classes.isLoading}
                noOptionsText={emptyOptionsText("Classes", classes.error)}
                slotProps={{ listbox: { component: ScrollSafeListbox, onScroll: classes.onScroll } }}
                renderInput={(params) => <TextField {...params} label="Start From a Class" />}
                sx={{ width: 220 }}
              />
              <Button onClick={() => void startFrom(undefined)}>Empty</Button>
              <Button variant={pasting ? "contained" : "outlined"} onClick={() => setPasting(!pasting)}>
                Paste a Table
              </Button>
            </Stack>
          )}
        </Stack>
        {table === "known" && (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            How many spells the class picks at each spell level by then: a wizard&apos;s spellbook, a sorcerer&apos;s
            spells known. &quot;All&quot; is every spell of its list.
          </Typography>
        )}
        {!!progressionError && !progression && <LoadError what="Spell list" error={progressionError} />}
        {canEdit && progression?.severalSpellLists && (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {className} gives spells in several lists, which these totals add up: edit each level&apos;s modifiers.
          </Typography>
        )}
        {pasting && editable && (
          <SpellPasteBox
            allowsAll={table === "known"}
            levels={levels}
            changesOf={changesOf}
            onCancel={() => setPasting(false)}
            onApply={(cells) => {
              setCells(table, cells);
              setPasting(false);
            }}
          />
        )}
        <SpellTableGrid
          label={TABLE_LABELS[table]}
          allowsAll={table === "known"}
          columns={SPELL_LEVELS.length}
          levels={levels}
          readOnly={!editable}
          value={(levelId, spellLevel) => cellOf(table, levelId, spellLevel)}
          saved={(levelId, spellLevel) => savedCell(table, levelId, spellLevel)}
          onCells={(cells) => setCells(table, cells)}
        />
      </Panel>
      <ProgressionSaveBar
        what="Spells"
        changes={changes}
        onDiscard={discard}
        onSave={handleSave}
        pending={save.isPending}
      />
    </Stack>
  );
}
