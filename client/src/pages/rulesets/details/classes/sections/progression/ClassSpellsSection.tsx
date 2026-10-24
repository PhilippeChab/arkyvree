import { Autocomplete, Button, Stack, TextField, Typography } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "react-router-dom";

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
import {
  useDebouncedValue,
  useListboxQuery,
  useRules,
  useRulesetPermissions,
  useSearchParam,
} from "@/client/src/hooks/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import {
  classProgressionQuery,
  classSpellsKnownQuery,
  classSpellsPerDayQuery,
} from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import type { ClassSectionProps } from "@/client/src/pages/rulesets/details/classes/classTab.ts";
import { byLevel } from "@/client/src/pages/rulesets/details/classes/sections/byLevel.ts";
import { entityOptionsQuery } from "@/client/src/pages/rulesets/optionQueries.ts";

import { ProgressionSaveBar } from "./ProgressionSaveBar.tsx";
import { NO_SPELL_EDITS, readSpellCell, SpellDraft, type SpellEdits, type SpellTable } from "./SpellDraft.ts";
import { type PlacedCell } from "./spellPaste.ts";
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

/**
 * A class's Spells tab: its spell tables as its rules describe them (3.5's spells per day and spells known, how many
 * spells it picks at each spell level), each a grid of the totals the book prints, edited in place, filled from
 * another class's table or emptied, or from a pasted table; one save writes them all. A class with no spell list
 * casts none, which its editor is told how to change.
 */
export function ClassSpellsSection({ rulesetId, classId, className, ruleset }: ClassSectionProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);
  const { rules } = useRules(ruleset.baseRules);
  const tables = rules?.progression.tables ?? [];
  // Its rules' words for a power ("Spell", "Spells")
  const [one, many] = [entityTypeLabel("powers", rules?.words), entityTypeLabel("powers", rules?.words, true)];
  const listName = rules?.progression.listName?.replaceAll("{class}", className);
  // The table it shows is its address's (which its old Spells Known tab's opens on), else its first
  const tableParam = useSearchParam("table", tables[0]?.key ?? "perDay");
  const shown = tables.find((rules) => rules.key === tableParam.value) ?? tables.at(0);
  const table: SpellTable = shown?.key ?? "perDay";
  // Its page's state (where Back goes) stays with it
  const location = useLocation();
  const setTable = (which: SpellTable) => tableParam.setValue(which, { replace: true, state: location.state });
  const [pasting, setPasting] = useState(false);
  const [classSearch, setClassSearch] = useState("");

  const perDay = useQuery(classSpellsPerDayQuery(rulesetId, classId));
  const known = useQuery(classSpellsKnownQuery(rulesetId, classId));
  const { data: progression, error: progressionError } = useQuery(classProgressionQuery(rulesetId, classId));
  // An editor's, of a class with one spell list: its classes to start from are only read then
  const editable = canEdit && !!progression?.spellList && !progression.severalSpellLists;
  const classes = useListboxQuery({
    ...entityOptionsQuery(rulesetId, "klasses", useDebouncedValue(classSearch), { limit: 20 }),
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
  const save = useProgressionSave(rulesetId, classId, many);
  const saved = {
    perDay: new Map(rowsOf.perDay.map((row) => [row.id, row.totals])),
    known: new Map(rowsOf.known.map((row) => [row.id, row.totals])),
  };
  const { discard, edits, forgetTokens, setEdits, settle, tokens } = useClassDraft<SpellEdits>(
    classId,
    "spells",
    levels,
    // Both its tables read as they are now
    !perDay.isFetching && !known.isFetching,
    NO_SPELL_EDITS,
    (next) => {
      const draft = new SpellDraft(levels, saved, next, tables);
      return tables.some((rules) => draft.countChanged(rules.key) > 0);
    },
  );
  const spells = new SpellDraft(levels, saved, edits, tables);
  const setCells = (which: SpellTable, cells: PlacedCell[]) =>
    setEdits((current) => new SpellDraft(levels, spells.saved, current, tables).write(which, cells));

  /** A typed or pasted block's cells, written: those it can't change (under an earlier All, holding a count) are told. */
  const writePasted = (cells: PlacedCell[]) => {
    const next = new SpellDraft(levels, spells.saved, spells.write(table, cells), tables);
    const unchanged = cells.filter(
      ({ levelId, spellLevel, value }) =>
        next.isKnownAbove(table, levelId, spellLevel) && next.cellOf(table, levelId, spellLevel) !== value,
    ).length;
    if (unchanged > 0) snackbar.info(`${formatCount(unchanged, "cell")} under an All left as they are`);
    setCells(table, cells);
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
        (shown?.columns ?? []).map((_, spellLevel) => ({
          levelId: id,
          spellLevel,
          value: readSpellCell(totalsAt(level)?.[spellLevel]),
        })),
      ),
    );
  };

  // Shown even once the tab can't save them (its class's spell lists changed elsewhere), so its Discard drops them
  const changes = tables.flatMap(({ key, label }) => {
    const count = spells.countChanged(key);
    return count > 0 ? [{ key, label: `${label}: ${formatCount(count, "cell")}` }] : [];
  });

  // What changes while the save runs stays, for the next save; refused (its levels changed since), it's sent again over
  // them as they're read again
  const handleSave = () =>
    save.mutate(
      { ...tokens(), spells: spells.buildBody() },
      { onSuccess: () => settle(spells.edits), onError: forgetTokens },
    );

  if (perDay.isLoading || known.isLoading) return <DiceSpinner sx={{ py: 4 }} />;
  const failed = (perDay.error && !perDay.data && perDay.error) || (known.error && !known.data && known.error);
  if (failed) return <LoadError what={many} error={failed} />;
  if (levels.length === 0 || !shown) {
    return (
      <BlankState
        icon={SpellUsesIcon}
        title="No levels"
        description={`Add levels to the class to give it ${many.toLowerCase()}.`}
      />
    );
  }
  const saveBar = (
    <ProgressionSaveBar
      what={many}
      changes={changes}
      onDiscard={discard}
      onSave={handleSave}
      canSave={editable}
      pending={save.isPending}
    />
  );
  if (progression && !progression.spellList) {
    const none = tables.map(({ label }) => label.toLowerCase()).join(" or ");
    const getsOne = listName ? ` A class that casts gets one from an aptitude named "${listName}".` : "";
    // Edits made before its list went (elsewhere) keep their Discard
    return (
      <Stack spacing={3}>
        <BlankState
          icon={SpellUsesIcon}
          title={`No ${many.toLowerCase()}`}
          description={
            canEdit
              ? `${className} has no ${one.toLowerCase()} list of its own, so no ${none}.${getsOne}`
              : `${className} casts no ${many.toLowerCase()}.`
          }
        />
        {saveBar}
      </Stack>
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
            options={tables.map(({ key, label }) => ({
              label: `${label}${spells.countChanged(key) > 0 ? " •" : ""}`,
              value: key,
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
        {shown.help && (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {shown.help}
          </Typography>
        )}
        {!!progressionError && !progression && <LoadError what={`${one} list`} error={progressionError} />}
        {canEdit && progression?.severalSpellLists && (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {className} gives {many.toLowerCase()} in several lists, which these totals add up: edit each level&apos;s
            modifiers.
          </Typography>
        )}
        {pasting && editable && (
          <SpellPasteBox
            table={shown}
            levels={levels}
            changesOf={(cells) => spells.changesOf(table, cells)}
            onCancel={() => setPasting(false)}
            onApply={(cells) => {
              writePasted(cells);
              setPasting(false);
            }}
          />
        )}
        <SpellTableGrid
          table={shown}
          levels={levels}
          readOnly={!editable}
          value={(levelId, spellLevel) => spells.cellOf(table, levelId, spellLevel)}
          saved={(levelId, spellLevel) => spells.savedCell(table, levelId, spellLevel)}
          knownAbove={(levelId, spellLevel) => spells.isKnownAbove(table, levelId, spellLevel)}
          onCells={(cells) => writePasted(cells)}
          onLockedPaste={() =>
            snackbar.info(
              `That cell knows every ${one.toLowerCase()} from an earlier level: paste into an open cell, or Paste a Table`,
            )
          }
        />
      </Panel>
      {saveBar}
    </Stack>
  );
}
