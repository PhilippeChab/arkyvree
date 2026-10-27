import { Autocomplete, Button, Stack, TextField, Typography } from "@mui/material";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { UsesIcon } from "@/client/src/components/icons/index.ts";
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
import type { ProgressionCounts, RulesDescription } from "@/client/src/lib/queries.ts";
import { entityTypeLabel, positionWordOf } from "@/client/src/lib/rulesetLabels.ts";
import { levelPageOf } from "@/client/src/pages/rulesets/details/owners/ownerKind.ts";
import {
  type OwnerProgressionBody,
  ownerProgressionQuery,
  ownerTableQuery,
  type TableRow,
} from "@/client/src/pages/rulesets/details/owners/ownerSectionQueries.ts";
import type { OwnerSectionProps } from "@/client/src/pages/rulesets/details/owners/ownerTab.ts";
import { byLevel } from "@/client/src/pages/rulesets/details/owners/sections/byLevel.ts";
import { entityOptionsQuery } from "@/client/src/pages/rulesets/optionQueries.ts";
import { isRecord } from "@/shared/isRecord.ts";

import { ProgressionSaveBar } from "./ProgressionSaveBar.tsx";
import { noEdits, readTableCell, TableDraft, type TableEdits } from "./TableDraft.ts";
import { TableGrid } from "./TableGrid.tsx";
import { type PlacedCell, type TableRules } from "./tablePaste.ts";
import { TablePasteBox } from "./TablePasteBox.tsx";
import { useOwnerDraft } from "./useOwnerDraft.ts";
import { useProgressionSave } from "./useProgressionSave.ts";

/** A table's level as its query reads it: its totals by column ("All" for a column's every value: every spell). */
interface LevelTotals {
  id: string;
  level: number;
  totals: Record<string, number | "All">;
}

/** What an owner's levels count (`counts`), and the words its tab says them in, its rules' (`rules`). */
interface OwnerTablesProps extends OwnerSectionProps {
  counts: ProgressionCounts;
  rules: RulesDescription;
}

/** A level's totals by its id, as a table's saved totals hold them. */
function byId(row: LevelTotals): [string, LevelTotals["totals"]] {
  return [row.id, row.totals];
}

/**
 * An owner's tables' tab: its tables as its rules describe them (3.5's spells per day and spells known, how many spells
 * it picks at each spell level), each a grid of the totals the book prints, edited in place, filled from another
 * owner's table or emptied, or from a pasted table; one save writes them all. An owner with no list counts none, which
 * its editor is told how to change.
 */
function OwnerTables({ rulesetId, ownerId, ownerName, ownerType, ruleset, counts, rules }: OwnerTablesProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);
  const { tables } = rules.progression;
  // Its rules' words for what its tables count ("Spell", "Spells")
  const [one, many] = [entityTypeLabel(counts.type, rules.words), entityTypeLabel(counts.type, rules.words, true)];
  // The table it shows is its address's (which its old Spells Known tab's opens on), else its first
  const tableParam = useSearchParam("table", tables[0]?.key ?? "");
  const shown = tables.find((rules) => rules.key === tableParam.value) ?? tables.at(0);
  const table = shown?.key ?? "";
  // Its page's state (where Back goes) stays with it
  const location = useLocation();
  const setTable = (which: string) => tableParam.setValue(which, { replace: true, state: location.state });
  const [pasting, setPasting] = useState(false);
  const [ownerSearch, setOwnerSearch] = useState("");

  const reads = useQueries({
    queries: tables.map((rules) => ownerTableQuery(rulesetId, ownerType, ownerId, rules.table)),
  });
  const { data: progression, error: progressionError } = useQuery(ownerProgressionQuery(rulesetId, ownerType, ownerId));
  // The list its counts go to, and whether its levels count on several, at the keys its rules say
  const answer: Record<string, unknown> | undefined = progression;
  const list = answer?.[counts.list];
  const several = answer?.[counts.several] === true;
  // An editor's, of an owner with one list: the others of its kind to start from are only read then
  const editable = canEdit && !!list && !several;
  const others = useListboxQuery({
    ...entityOptionsQuery(rulesetId, ownerType, useDebouncedValue(ownerSearch), { limit: 20 }),
    enabled: editable,
  });

  // Its levels are its first table's rows, each its number (`position`)
  const levels = (reads[0]?.data ?? [])
    .toSorted(byLevel)
    .map(({ id, position, updatedAt }) => ({ id, level: position, updatedAt }));
  // Its rules' word for the owner ("Class")
  const word = entityTypeLabel(ownerType, rules.words);
  const save = useProgressionSave(rulesetId, ownerId, {
    ownerType,
    levelType: levelPageOf(rules)?.type ?? "",
    what: many,
    word,
  });
  const saved = Object.fromEntries(
    tables.map((rules, index) => [rules.key, new Map(totalsOf(reads[index]?.data ?? [], rules).map(byId))]),
  );
  const { discard, edits, forgetTokens, setEdits, settle, tokens } = useOwnerDraft<TableEdits>(
    ownerId,
    counts.tab,
    levels,
    // Every table read as it is now
    reads.every((read) => !read.isFetching),
    noEdits(tables),
    (next) => {
      const draft = new TableDraft(levels, saved, next, tables);
      return tables.some((rules) => draft.countChanged(rules.key) > 0);
    },
  );
  const draft = new TableDraft(levels, saved, edits, tables);
  const setCells = (which: string, cells: PlacedCell[]) =>
    setEdits((current) => new TableDraft(levels, draft.saved, current, tables).write(which, cells));

  /** A typed or pasted block's cells, written: those it can't change (under an earlier All, holding a count) are told. */
  const writePasted = (cells: PlacedCell[]) => {
    const next = new TableDraft(levels, draft.saved, draft.write(table, cells), tables);
    const unchanged = cells.filter(
      ({ levelId, column, value }) =>
        next.isKnownAbove(table, levelId, column) && next.cellOf(table, levelId, column) !== value,
    ).length;
    if (unchanged > 0) snackbar.info(`${formatCount(unchanged, "cell")} under an All left as they are`);
    setCells(table, cells);
  };

  /** Another owner's table, the one the tab shows: none for no owner. */
  const readTable = async (otherId: string | undefined): Promise<LevelTotals[]> => {
    if (!otherId || !shown) return [];
    return totalsOf(await queryClient.fetchQuery(ownerTableQuery(rulesetId, ownerType, otherId, shown.table)), shown);
  };

  /** Every cell of the table from another owner's, by level number: none where it has none. */
  const startFrom = async (otherId: string | undefined) => {
    let other: LevelTotals[];
    try {
      other = await readTable(otherId);
    } catch (error) {
      snackbar.error(error, `Failed to load the ${word.toLowerCase()}'s table`);
      return;
    }
    const totalsAt = (level: number) => other.find((row) => row.level === level)?.totals;
    setCells(
      table,
      levels.flatMap(({ id, level }) =>
        (shown?.columns ?? []).map((_, column) => ({
          levelId: id,
          column,
          value: readTableCell(totalsAt(level)?.[column]),
        })),
      ),
    );
  };

  // Shown even once the tab can't save them (its owner's lists changed elsewhere), so its Discard drops them
  const changes = tables.flatMap(({ key, label }) => {
    const count = draft.countChanged(key);
    return count > 0 ? [{ key, label: `${label}: ${formatCount(count, "cell")}` }] : [];
  });

  // What changes while the save runs stays, for the next save; refused (its levels changed since), it's sent again over
  // them as they're read again; its tables' cells at the key its rules say
  const handleSave = () =>
    save.mutate({ ...tokens(), [counts.body]: draft.buildBody() } as OwnerProgressionBody, {
      onSuccess: () => settle(draft.edits),
      onError: forgetTokens,
    });

  if (reads.some((read) => read.isLoading)) return <DiceSpinner sx={{ py: 4 }} />;
  const failed = reads.map((read) => read.error && !read.data && read.error).find(Boolean);
  if (failed) return <LoadError what={many} error={failed} />;
  if (levels.length === 0 || !shown) {
    return (
      <BlankState
        icon={UsesIcon}
        title="No levels"
        description={`Add levels to the ${word.toLowerCase()} to give it ${many.toLowerCase()}.`}
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
  if (progression && !list) {
    const none = tables.map(({ label }) => label.toLowerCase()).join(" or ");
    // Each placeholder in one pass, its value as written
    const say = (text: string) =>
      text.replace(/\{(class|tables)\}/g, (_, placeholder: string) => (placeholder === "class" ? ownerName : none));
    // Edits made before its list went (elsewhere) keep their Discard
    return (
      <Stack spacing={3}>
        <BlankState
          icon={UsesIcon}
          title={`No ${many.toLowerCase()}`}
          description={canEdit ? say(counts.none.editor) : say(counts.none.viewer)}
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
              label: `${label}${draft.countChanged(key) > 0 ? " •" : ""}`,
              value: key,
            }))}
          />
          {editable && (
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
              <Autocomplete
                size="small"
                options={others.items.filter((other) => other.id !== ownerId)}
                getOptionLabel={(other) => other.name}
                value={null}
                onChange={(_, other) => other && void startFrom(other.id)}
                onInputChange={(_, input, reason) => {
                  if (reason === "input") setOwnerSearch(input);
                }}
                filterOptions={(options) => options}
                loading={others.isLoading}
                noOptionsText={emptyOptionsText(entityTypeLabel(ownerType, rules.words, true), others.error)}
                slotProps={{ listbox: { component: ScrollSafeListbox, onScroll: others.onScroll } }}
                renderInput={(params) => (
                  <TextField {...params} label={`Start From a ${entityTypeLabel(ownerType, rules.words)}`} />
                )}
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
        {canEdit && several && (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {ownerName} gives {many.toLowerCase()} in several lists, which these totals add up: edit each level&apos;s
            modifiers.
          </Typography>
        )}
        {pasting && editable && (
          <TablePasteBox
            table={shown}
            levels={levels}
            levelWord={entityTypeLabel(levelPageOf(rules)?.type ?? "", rules.words).toLowerCase()}
            changesOf={(cells) => draft.changesOf(table, cells)}
            onCancel={() => setPasting(false)}
            onApply={(cells) => {
              writePasted(cells);
              setPasting(false);
            }}
          />
        )}
        <TableGrid
          table={shown}
          levels={levels}
          positionWord={positionWordOf(levelPageOf(rules)?.type ?? "", rules.words)}
          readOnly={!editable}
          value={(levelId, column) => draft.cellOf(table, levelId, column)}
          saved={(levelId, column) => draft.savedCell(table, levelId, column)}
          knownAbove={(levelId, column) => draft.isKnownAbove(table, levelId, column)}
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

/** A table's levels as its query reads them (`rows`): each with its totals, at the key its rules say (`totals`). */
function totalsOf(rows: readonly TableRow[], table: TableRules): LevelTotals[] {
  return rows.map((row) => {
    const totals = row[table.totals];
    return { id: row.id, level: row.position, totals: isRecord(totals) ? (totals as LevelTotals["totals"]) : {} };
  });
}

/**
 * An owner's tables' tab (its rules' progression's `counts`: 3.5's Spells): the tables its levels count on; none where
 * its rules count none.
 */
export function OwnerTablesSection({ ruleset, ...props }: OwnerSectionProps) {
  const { rules } = useRules(ruleset.baseRules);
  const counts = rules?.progression.counts;
  if (!rules || !counts) return null;
  return <OwnerTables {...props} ruleset={ruleset} counts={counts} rules={rules} />;
}
