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
import { useDebouncedValue, useListboxQuery, useRulesetPermissions, useSearchParam } from "@/client/src/hooks/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
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

/** Each table's label, as its toggle and its save bar name it. */
const TABLE_LABELS: Record<SpellTable, string> = { perDay: "Spells per Day", known: "Spells Known" };

/**
 * A class's Spells tab: its spells per day and its spells known (how many spells it picks at each spell level), each
 * a grid of the totals the book prints, edited in place, filled from another class's table or emptied, or from a
 * pasted table; one save writes both. A class with no spell list casts none, which its editor is told how to change.
 */
export function ClassSpellsSection({ rulesetId, classId, className, ruleset }: ClassSectionProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);
  // The table it shows is its address's, which its old Spells Known tab's opens on
  const tableParam = useSearchParam("table", "perDay");
  const table: SpellTable = tableParam.value === "known" ? "known" : "perDay";
  const setTable = (which: SpellTable) => tableParam.setValue(which, { replace: true });
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
  const save = useProgressionSave(rulesetId, classId, "Spells");
  const { discard, edits, forgetTokens, setEdits, settle, tokens } = useClassDraft<SpellEdits>(
    classId,
    levels,
    // Both its tables read as they are now
    !perDay.isFetching && !known.isFetching,
    NO_SPELL_EDITS,
  );
  const spells = new SpellDraft(
    levels,
    {
      perDay: new Map(rowsOf.perDay.map((row) => [row.id, row.totals])),
      known: new Map(rowsOf.known.map((row) => [row.id, row.totals])),
    },
    edits,
  );
  const setCells = (which: SpellTable, cells: PlacedCell[]) =>
    setEdits((current) => new SpellDraft(levels, spells.saved, current).write(which, cells));

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
        SPELL_LEVELS.map((spellLevel) => ({
          levelId: id,
          spellLevel,
          value: readSpellCell(totalsAt(level)?.[spellLevel]),
        })),
      ),
    );
  };

  // Shown even once the tab can't save them (its class's spell lists changed elsewhere), so its Discard drops them
  const changes = (["perDay", "known"] as const).flatMap((which) => {
    const count = spells.countChanged(which);
    return count > 0 ? [{ key: which, label: `${TABLE_LABELS[which]}: ${formatCount(count, "cell")}` }] : [];
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
            ? `${className} has no spell list of its own, so no spells per day or known. A class that casts gets one from an aptitude named "${className} Spells".`
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
              label: `${TABLE_LABELS[which]}${spells.countChanged(which) > 0 ? " •" : ""}`,
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
            changesOf={(cells) => spells.changesOf(table, cells)}
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
          value={(levelId, spellLevel) => spells.cellOf(table, levelId, spellLevel)}
          saved={(levelId, spellLevel) => spells.savedCell(table, levelId, spellLevel)}
          knownAbove={(levelId, spellLevel) => spells.isKnownAbove(table, levelId, spellLevel)}
          onCells={(cells) => setCells(table, cells)}
        />
      </Panel>
      <ProgressionSaveBar
        what="Spells"
        changes={changes}
        onDiscard={discard}
        onSave={handleSave}
        canSave={editable}
        pending={save.isPending}
      />
    </Stack>
  );
}
