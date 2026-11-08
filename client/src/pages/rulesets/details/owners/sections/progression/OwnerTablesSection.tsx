import { Alert, Autocomplete, Button, Stack, TextField, Typography } from "@mui/material";
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
import { emptyOptionsText, errorMessage } from "@/client/src/lib/errorMessage.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import type { ProgressionCounts, RulesDescription } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { entityTypeLabel, positionWordsOf, withArticle } from "@/client/src/lib/rulesetLabels.ts";
import { ownedPageOf } from "@/client/src/pages/rulesets/details/owners/ownerKind.ts";
import {
  type OwnerProgressionBody,
  ownerProgressionPlanQuery,
  ownerProgressionQuery,
  ownerTableQuery,
  type OwnerTablesPlan,
  type TableRow,
} from "@/client/src/pages/rulesets/details/owners/ownerSectionQueries.ts";
import type { OwnerSectionProps } from "@/client/src/pages/rulesets/details/owners/ownerTab.ts";
import { byPosition } from "@/client/src/pages/rulesets/details/owners/sections/byPosition.ts";
import { entityOptionsQuery } from "@/client/src/pages/rulesets/optionQueries.ts";
import { isRecord } from "@/shared/isRecord.ts";

import { readOwnList } from "./ownList.ts";
import { ProgressionSaveBar } from "./ProgressionSaveBar.tsx";
import {
  noEdits,
  type PlannedTables,
  readTableCell,
  type SavedTotals,
  TableDraft,
  type TableEdits,
  type TablesBody,
} from "./TableDraft.ts";
import { TableGrid } from "./TableGrid.tsx";
import { type PlacedCell, type TableRules } from "./tablePaste.ts";
import { TablePasteBox } from "./TablePasteBox.tsx";
import { useCreateOwnList } from "./useCreateOwnList.ts";
import { useOwnerDraft } from "./useOwnerDraft.ts";
import { useProgressionSave } from "./useProgressionSave.ts";

/**
 * A table's owned entity as its query reads it: its totals by column ("All" for a column's every value: every spell).
 */
interface OwnedTotals {
  id: string;
  position: number;
  totals: Record<string, number | "All">;
}

/** What an owner's owned entities count (`counts`), and the words its tab says them in, its rules' (`rules`). */
interface OwnerTablesProps extends OwnerSectionProps {
  counts: ProgressionCounts;
  rules: RulesDescription;
}

/** An owned entity's totals by its id, as a table's saved totals hold them. */
function byId(row: OwnedTotals): [string, OwnedTotals["totals"]] {
  return [row.id, row.totals];
}

/**
 * An owner's tables' tab: its tables as its rules describe them (3.5's spells per day and spells known, how many spells
 * it picks at each spell level), each a grid of the totals the book prints, edited in place, filled from another
 * owner's table or emptied, or from a pasted table, its draft shown as its rules answer it (`…/progression/plan`); one
 * save writes them all. An owner with no list counts none, which its editor is told how to change; one whose tables
 * take no save says why, in its rules' words.
 */
function OwnerTables({ rulesetId, ownerId, ownerName, ownerType, ruleset, counts, rules }: OwnerTablesProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);
  const { tables } = rules.progression;
  const { data: progression, error: progressionError } = useQuery(ownerProgressionQuery(rulesetId, ownerType, ownerId));
  // The list its counts go to, and why its tables take no save (none when they take one), at the keys its rules say
  const answer: Record<string, unknown> | undefined = progression;
  // The tables it shows: its rules' but those its answer hides (D&D 5e's warlock's Spell Slots, another class's Pact
  // Magic)
  const hidden = readHiddenTables(counts.hidden === undefined ? undefined : answer?.[counts.hidden]);
  const shownTables = tables.filter(({ key }) => !hidden.includes(key));
  // Its rules' words for what its tables count ("Spell", "Spells")
  const [one, many] = [entityTypeLabel(counts.type, rules.words), entityTypeLabel(counts.type, rules.words, true)];
  // The table it shows is its address's (which its old Spells Known tab's opens on), else its first
  const tableParam = useSearchParam("table", shownTables[0]?.key ?? "");
  const shown = shownTables.find((rules) => rules.key === tableParam.value) ?? shownTables.at(0);
  const table = shown?.key ?? "";
  // Its page's state (where Back goes) stays with it
  const location = useLocation();
  const setTable = (which: string) => tableParam.setValue(which, { replace: true, state: location.state });
  const [pasting, setPasting] = useState(false);
  const [ownerSearch, setOwnerSearch] = useState("");

  const reads = useQueries({
    queries: tables.map((rules) => ownerTableQuery(rulesetId, ownerType, ownerId, rules.table)),
  });
  const list = answer?.[counts.list];
  const refusal = answer?.[counts.refusal];
  // Without a list, its own one, which its editor can make here, as its list tab's first add does
  const ownList = readOwnList(answer?.[counts.ownList]);
  const listKind = rules.kinds.find(({ type }) => type === counts.type)?.pools?.type;
  const createList = useCreateOwnList(rulesetId, ownerType, ownerId, { lists: counts.lists, listKind });
  // An editor's, of an owner whose tables take a save: the others of its kind to start from are only read then
  const editable = canEdit && refusal === null;
  const others = useListboxQuery({
    ...entityOptionsQuery(rulesetId, ownerType, useDebouncedValue(ownerSearch), { limit: 20 }),
    enabled: editable,
  });

  // Its owned entities are its first table's rows, each its number (`position`)
  const ownedEntities = (reads[0]?.data ?? [])
    .toSorted(byPosition)
    .map(({ id, position, updatedAt }) => ({ id, position, updatedAt }));
  // Its rules' word for the owner ("Class"), and the kind of its owned entities
  const word = entityTypeLabel(ownerType, rules.words);
  const ownedType = ownedPageOf(rules)?.type ?? "";
  // An owned entity's position's word, which names one ("Level 3"), and as a sentence says several ("levels")
  const positionWord = positionWordsOf(ownedType, rules.words);
  const positionPlural = positionWord.many.toLowerCase();
  const save = useProgressionSave(rulesetId, ownerId, {
    ownerType,
    ownedType,
    what: many,
    word,
  });
  // Each table's totals by its key, of its rows by its name
  const totalsByKey = (rowsOf: (rules: TableRules, index: number) => readonly TableRow[] | undefined) =>
    Object.fromEntries(
      tables.map((rules, index): [string, SavedTotals] => [
        rules.key,
        new Map(totalsOf(rowsOf(rules, index) ?? [], rules).map(byId)),
      ]),
    );
  const saved = totalsByKey((_, index) => reads[index]?.data);
  // A draft's save (`body`), and its rules' answer for it once they gave it (`plan`), asked of an editor's alone
  const planQuery = (body: TablesBody) =>
    ownerProgressionPlanQuery(
      rulesetId,
      ownerType,
      ownerId,
      counts.body,
      Object.keys(body).length > 0 ? body : undefined,
    );
  const plannedOf = (planned: OwnerTablesPlan<TablesBody> | undefined) =>
    planned && { body: planned.sent, totals: totalsByKey((rules) => planned.tables[rules.table]) };
  const draftOf = (next: TableEdits, planned?: PlannedTables) =>
    new TableDraft(ownedEntities, saved, next, tables, planned);
  const { discard, edits, forgetTokens, setEdits, settle, tokens } = useOwnerDraft<TableEdits>(
    ownerId,
    counts.tab,
    ownedEntities,
    // Every table read as it is now
    reads.every((read) => !read.isFetching),
    noEdits(tables),
    (next) => {
      // As its rules answered it, once they did and while it holds (not read again)
      const state = queryClient.getQueryState(planQuery(draftOf(next).buildBody()).queryKey);
      const held = state?.fetchStatus === "idle" && !state.isInvalidated ? state.data : undefined;
      const draft = draftOf(next, plannedOf(held));
      return tables.some((rules) => draft.countChanged(rules.key) > 0);
    },
  );
  // Its cells show as edited while its rules answer a change (`planning`), which an answer for another draft, or one
  // read again (its tables saved since), never stands in for
  const plan = useQuery({ ...planQuery(draftOf(edits).buildBody()), enabled: editable });
  const planning = editable && plan.isFetching;
  const draft = draftOf(edits, planning ? undefined : plannedOf(plan.data));
  const setCells = (which: string, cells: PlacedCell[]) =>
    setEdits((current) => draft.withEdits(current).write(which, cells));

  /**
   * A typed or pasted block's cells, written: those it can't change (under an earlier All, holding a count) are told.
   */
  const writePasted = (cells: PlacedCell[]) => {
    const next = draft.withEdits(draft.write(table, cells));
    const unchanged = cells.filter(
      ({ ownedId, column, value }) =>
        next.isAllAbove(table, ownedId, column) && next.cellOf(table, ownedId, column) !== value,
    ).length;
    if (unchanged > 0 && shown?.all)
      snackbar.info(`${formatCount(unchanged, "cell")} under ${withArticle(shown.all.word)} left as they are`);
    setCells(table, cells);
  };

  /** Another owner's table, the one the tab shows: none for no owner. */
  const readTable = async (otherId: string | undefined): Promise<OwnedTotals[]> => {
    if (!otherId || !shown) return [];
    return totalsOf(await queryClient.fetchQuery(ownerTableQuery(rulesetId, ownerType, otherId, shown.table)), shown);
  };

  /** Every cell of the table from another owner's, by position: none where it has none. */
  const startFrom = async (otherId: string | undefined) => {
    let other: OwnedTotals[];
    try {
      other = await readTable(otherId);
    } catch (error) {
      snackbar.error(error, `Failed to load the ${word.toLowerCase()}'s table`);
      return;
    }
    const totalsAt = (position: number) => other.find((row) => row.position === position)?.totals;
    setCells(
      table,
      ownedEntities.flatMap(({ id, position }) =>
        (shown?.columns ?? []).map(({ key }, column) => ({
          ownedId: id,
          column,
          value: readTableCell(totalsAt(position)?.[key]),
        })),
      ),
    );
  };

  // Each placeholder of its rules' texts in one pass, its value as written
  const placeholders: Record<string, string> = {
    ownerName,
    tables: tables.map(({ label }) => label.toLowerCase()).join(" or "),
  };
  const say = (text: string) => text.replace(/\{(ownerName|tables)\}/g, (_, name: string) => placeholders[name]);
  // Shown even once the tab can't save them (its owner's lists changed elsewhere), so its Discard drops them
  const changes = tables.flatMap(({ key, label }) => {
    const count = draft.countChanged(key);
    return count > 0 ? [{ key, label: `${label}: ${formatCount(count, "cell")}` }] : [];
  });

  // What changes while the save runs stays, for the next save; refused (its owned entities changed since), it's sent
  // again over them as they're read again; its tables' cells at the key its rules say
  const handleSave = () =>
    save.mutate({ ...tokens(), [counts.body]: draft.buildBody() } as OwnerProgressionBody, {
      onSuccess: () => {
        // Its rules' answers were for the tables as they were: the next draft asks again
        queryClient.removeQueries({
          queryKey: QUERY_KEYS.rulesets.ownerProgressionPlans(rulesetId, ownerId),
          type: "inactive",
        });
        settle(draft.edits);
      },
      onError: forgetTokens,
    });

  if (reads.some((read) => read.isLoading)) return <DiceSpinner sx={{ py: 4 }} />;
  const failed = reads.map((read) => read.error && !read.data && read.error).find(Boolean);
  if (failed) return <LoadError what={many} error={failed} />;
  if (ownedEntities.length === 0 || !shown) {
    return (
      <BlankState
        icon={UsesIcon}
        title={`No ${positionPlural}`}
        description={`Add ${positionPlural} to the ${word.toLowerCase()} to give it ${many.toLowerCase()}.`}
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
    // Edits made before its list went (elsewhere) keep their Discard
    return (
      <Stack spacing={3}>
        <BlankState
          icon={UsesIcon}
          title={`No ${many.toLowerCase()}`}
          description={canEdit ? say(counts.none.editor) : say(counts.none.viewer)}
          action={
            canEdit &&
            ownList && (
              <Button
                variant="contained"
                disabled={createList.isPending}
                onClick={() => createList.mutate(ownList.name)}
              >
                <DiceSpinner size="small" loading={createList.isPending}>
                  {counts.create.replace("{name}", () => ownList.name)}
                </DiceSpinner>
              </Button>
            )
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
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <OptionToggle
              label="Table"
              value={table}
              onChange={setTable}
              options={shownTables.map(({ key, label }) => ({
                label: `${label}${draft.countChanged(key) > 0 ? " •" : ""}`,
                value: key,
              }))}
            />
            {planning && <DiceSpinner size="small" />}
          </Stack>
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
        {canEdit && typeof refusal === "string" && (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {refusal}
          </Typography>
        )}
        {editable && plan.isError && (
          <Alert severity="error">
            {errorMessage(plan.error, `Failed to check the ${word.toLowerCase()} ${many.toLowerCase()}`)}
          </Alert>
        )}
        {pasting && editable && (
          <TablePasteBox
            table={shown}
            ownedEntities={ownedEntities}
            ownedWord={entityTypeLabel(ownedType, rules.words).toLowerCase()}
            positionWord={positionWord}
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
          ownedEntities={ownedEntities}
          positionWord={positionWord}
          readOnly={!editable}
          value={(ownedId, column) => draft.cellOf(table, ownedId, column)}
          edited={(ownedId, column) => draft.editedCell(table, ownedId, column)}
          saved={(ownedId, column) => draft.savedCell(table, ownedId, column)}
          allAbove={(ownedId, column) => draft.isAllAbove(table, ownedId, column)}
          onCells={(cells) => writePasted(cells)}
          onLockedPaste={() => shown?.all && snackbar.info(shown.all.lockedPaste)}
        />
      </Panel>
      {saveBar}
    </Stack>
  );
}

/** The keys of the tables an owner's progression answer hides (`value`, its rules' `counts.hidden` key's): none else. */
function readHiddenTables(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((key): key is string => typeof key === "string") : [];
}

/**
 * A table's owned entities as its query reads them (`rows`): each with its totals, at the key its rules say (`totals`).
 */
function totalsOf(rows: readonly TableRow[], table: TableRules): OwnedTotals[] {
  return rows.map((row) => {
    const totals = row[table.totals];
    return { id: row.id, position: row.position, totals: isRecord(totals) ? (totals as OwnedTotals["totals"]) : {} };
  });
}

/**
 * An owner's tables' tab (its rules' progression's `counts`: 3.5's Spells): the tables its owned entities count on;
 * none where its rules count none.
 */
export function OwnerTablesSection({ ruleset, ...props }: OwnerSectionProps) {
  const { rules } = useRules(ruleset.baseRules);
  const counts = rules?.progression.counts;
  if (!rules || !counts) return null;
  return <OwnerTables {...props} ruleset={ruleset} counts={counts} rules={rules} />;
}
