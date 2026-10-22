import { Box, ListItemButton, ListItemText } from "@mui/material";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { type Control, useController } from "react-hook-form";

import {
  BlankNote,
  DiceSpinner,
  ExpandArrow,
  LoadError,
  LoadMoreButton,
} from "@/client/src/components/common/index.ts";
import { useDebouncedValue, useListboxQuery } from "@/client/src/hooks/index.ts";
import { itemsBeforeLastPage, pageItems } from "@/client/src/lib/pageItems.ts";
import { entityTypeLabel, formatWordCount } from "@/client/src/lib/rulesetLabels.ts";

import { AutoGrantedPicks } from "./AutoGrantedPicks.tsx";
import { withoutPick, withPick } from "./fitPicks.ts";
import {
  type AnswerOf,
  answerOf,
  type PickerAt,
  type PlanAnswer,
  type PlanRequest,
  type StepOf,
  type StepOption,
  type StepOptionGroup,
  stepOptionsQuery,
} from "./levelPlanQueries.ts";
import type { LevelPlanForm, PlannedPick } from "./planRequest.ts";
import { PickOption, PoolPicker } from "./PoolPicker.tsx";
import { useCharacterRules } from "./useCharacterRules.ts";
import type { OpenPool } from "./useLevelWizard.ts";

interface GroupExpansionProps {
  /** Where the group's row was listed: its members are checked there too. */
  at: PickerAt;
  characterId: string;
  group: string;
  onPick: (option: StepOption) => void;
  plan: PlanRequest | undefined;
  step: string;
}

/** What a level wizard hands its `pick` step: the plan's answer, its picks as they fit, and its pickers' state. */
interface PickState {
  answer: PlanAnswer | undefined;
  answerError: Error | null;
  /** The plan's form: its picks, which the step changes */
  control: Control<LevelPlanForm>;
  expandedGroups: ReadonlySet<string>;
  /** The form as the answer fits it: its picks, each pool's those it has room for */
  fitted: LevelPlanForm;
  isAnswering: boolean;
  openPools: Record<string, OpenPool | null>;
  /** The plan the options are checked against: its picks as they fit */
  pickerRequest: PlanRequest | undefined;
  searches: Record<string, string>;
  setOpenPool: (stepName: string, at: OpenPool | null) => void;
  setSearch: (stepName: string, search: string) => void;
  toggleGroup: (group: string) => void;
}

interface PickStepProps {
  characterId: string;
  step: StepOf<"pick">;
  wizard: PickState;
}

/** A pool a chip opens: the pool, at a tier when it picks by tier. */
interface PoolAt {
  pool: PickPool;
  tier?: string;
}

type PickPool = AnswerOf<"pick">["pools"][string];

/** The open pool's options, a page at a time. */
const OPTIONS_PAGE = 20;

/** A group's members, listed under its row once it expands, checked where its row was. */
function GroupExpansion({ at, characterId, group, onPick, plan, step }: GroupExpansionProps) {
  const query = useInfiniteQuery({
    ...stepOptionsQuery(characterId, step, plan, { ...at, group }, "", OPTIONS_PAGE),
    placeholderData: keepPreviousData,
  });
  // A group's members are plain options, never groups
  const members = pageItems<StepOption | StepOptionGroup>(query.data).filter(
    (item): item is StepOption => !("count" in item),
  );
  const previousItemCount = itemsBeforeLastPage<StepOption | StepOptionGroup>(query.data);

  if (query.isLoading) return <DiceSpinner sx={{ py: 4 }} />;
  if (query.error && members.length === 0) {
    return (
      <Box sx={{ pl: 6, py: 1 }}>
        <LoadError what="Variants" error={query.error} />
      </Box>
    );
  }

  return (
    <>
      {members.map((option, i) => (
        <PickOption
          key={option.id}
          name={option.name}
          description={option.description}
          requirementTree={option.requirementTree}
          disabled={!option.eligible}
          onPick={() => onPick(option)}
          indented
          enterIndex={i >= previousItemCount ? i - previousItemCount : undefined}
        />
      ))}
      {/* Under the members, at their indent, while there's a page to load */}
      {query.hasNextPage && (
        <Box sx={{ pl: 6, py: 0.5 }}>
          <LoadMoreButton
            nested
            hasNextPage
            isFetchingNextPage={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          />
        </Box>
      )}
    </>
  );
}

/** A pool's room for the step's picks, at a tier when it picks by tier: none below 0 (a shared pool's other picks). */
function roomAt(pool: PickPool, tier: string | undefined) {
  return Math.max(0, tier === undefined ? pool.available : (pool.tiers?.[tier]?.available ?? 0));
}

/**
 * A `pick` step: entities picked into pools (3.5's feats and spells, by aptitude), a pool with tiers one tier at a
 * time (a spell level), what the plan grants on its own above them, and the open pool's options, searched, checked
 * against the plan, a group's members (a feat's variants) listed as its row expands.
 */
export function PickStep({ characterId, step, wizard }: PickStepProps) {
  const { rules } = useCharacterRules(characterId);
  const { answer, answerError, control, fitted, isAnswering, pickerRequest } = wizard;
  const pick = answerOf(answer, step);
  // Changed from the picks as they fit, which the wizard reads
  // The form's picks, every step's: a step replaces them whole, so the wizard sees a new plan
  const { field } = useController({ control, name: "picks" });
  const setPicks = (stepPicks: Record<string, PlannedPick[]>) =>
    field.onChange({ ...field.value, [step.name]: stepPicks });
  const picks = fitted.picks[step.name] ?? {};
  const search = wizard.searches[step.name] ?? "";
  const debouncedSearch = useDebouncedValue(search);

  // The pools with room for a pick, a pool with tiers each tier with room on its own chip
  const pools = Object.values(pick?.pools ?? {}).flatMap((pool): PoolAt[] => {
    if (roomAt(pool, undefined) <= 0) return [];
    if (!pool.tiers) return [{ pool }];
    return Object.keys(pool.tiers)
      .filter((tier) => roomAt(pool, tier) > 0)
      .map((tier) => ({ pool, tier }));
  });
  // The pool open, while it has room: a removed pick that granted it closes it
  const opened = wizard.openPools[step.name];
  const open = pools.find(({ pool, tier }) => pool.id === opened?.pool && tier === opened?.tier);
  const at: PickerAt = open
    ? { advancement: pick?.next[open.pool.id]?.[open.tier ?? ""], pool: open.pool.id, tier: open.tier }
    : {};

  const options = useListboxQuery({
    // Asked while a pool is open
    ...stepOptionsQuery(characterId, step.name, open && pickerRequest, at, debouncedSearch, OPTIONS_PAGE),
  });
  const page = options.items as (StepOption | StepOptionGroup)[];

  // Its rules' words: what it picks ("Feats"), and what its pools are ("Aptitude")
  const what = entityTypeLabel(step.kind ?? "", rules?.words, true);
  const poolWord = entityTypeLabel(step.pools ?? "", rules?.words);
  if (isAnswering) return <DiceSpinner />;
  if (answerError && !answer) return <LoadError what={step.label} error={answerError} />;
  if (!pick) return null;
  if (pools.length === 0 && pick.granted.length === 0)
    return <BlankNote>No {what.toLowerCase()} to select at this level</BlankNote>;

  const tierName = (tier: string | undefined) => (tier === undefined ? undefined : (step.words.tiers?.[tier] ?? tier));
  const picksAt = (pool: string, tier: string | undefined) =>
    (picks[pool] ?? []).filter((planned) => tier === undefined || planned.tier === tier);
  const pickInto = (option: { description: string | null; id: string; name: string }) => {
    if (!open) return;
    const planned: PlannedPick = {
      description: option.description,
      id: option.id,
      name: option.name,
      ...(open.tier !== undefined && { tier: open.tier }),
    };
    setPicks(withPick(picks, open.pool.id, planned));
  };

  return (
    <PoolPicker
      what={what}
      poolWord={poolWord}
      granted={
        pick.granted.length > 0 && (
          <AutoGrantedPicks
            what={what}
            note={step.words.grantNote}
            picks={pick.granted}
            defaultCollapsed={pools.length > 0}
          />
        )
      }
      pools={pools.map(({ pool, tier }) => {
        const tierLabel = tierName(tier);
        const optional = pool.optional ? ` (${step.words.optional})` : "";
        return {
          key: `${pool.id}-${tier ?? ""}`,
          label: `${pool.name}${tierLabel ? ` — ${tierLabel}` : ""} ${picksAt(pool.id, tier).length}/${roomAt(pool, tier)}${optional}`,
          open: open?.pool.id === pool.id && open.tier === tier,
          onOpen: () => wizard.setOpenPool(step.name, { pool: pool.id, ...(tier !== undefined && { tier }) }),
        };
      })}
      open={
        open && {
          name: open.pool.name,
          level: tierName(open.tier),
          picks: picksAt(open.pool.id, open.tier),
          room: roomAt(open.pool, open.tier),
          onRemove: (id) => setPicks(withoutPick(picks, open.pool.id, id)),
        }
      }
      search={search}
      onSearch={(value) => wizard.setSearch(step.name, value)}
      options={{
        count: page.length,
        error: options.error,
        fetchingNextPage: options.isFetchingNextPage,
        loading: options.isLoading,
        onScroll: options.onScroll,
      }}
    >
      {open &&
        page.map((row) => {
          // A group of two or more lists its members as it expands; a group of one is its member
          const group = "count" in row && row.count > 1 ? row.group : null;
          if (group !== null && "count" in row) {
            const isExpanded = wizard.expandedGroups.has(group);
            const groupWord = step.words.group;
            return (
              <Box key={`group-${group}`}>
                <ListItemButton onClick={() => wizard.toggleGroup(group)} aria-expanded={isExpanded} sx={{ gap: 0.5 }}>
                  <ExpandArrow open={isExpanded} />
                  <ListItemText
                    primary={row.name}
                    secondary={groupWord ? formatWordCount(row.count, groupWord) : row.count}
                  />
                </ListItemButton>
                {isExpanded && (
                  <GroupExpansion
                    characterId={characterId}
                    step={step.name}
                    plan={pickerRequest}
                    at={at}
                    group={group}
                    onPick={pickInto}
                  />
                )}
              </Box>
            );
          }
          // A pick made already stays listed when it can be picked again (a stackable feat at several levels): the
          // server leaves out what can't
          return (
            <PickOption
              key={row.id}
              name={row.name}
              description={row.description}
              requirementTree={row.requirementTree}
              disabled={!row.eligible}
              onPick={() => pickInto(row)}
            />
          );
        })}
    </PoolPicker>
  );
}
