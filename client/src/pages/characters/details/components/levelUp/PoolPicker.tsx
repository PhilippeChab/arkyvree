import { Box, List, ListItemButton, ListItemText, Stack, TextField, Typography } from "@mui/material";
import type { ReactNode, UIEvent } from "react";

import {
  BlankNote,
  ChoiceChip,
  DiceSpinner,
  LoadError,
  NextPageSpinner,
  PickChip,
  SubsectionTitle,
} from "@/client/src/components/common/index.ts";
import { fadeInUpSx } from "@/client/src/theme/animations.ts";

import { OptionTooltip } from "./OptionTooltip.tsx";
import { poolName } from "./poolName.ts";

/** The pool open to pick from: its name, what's picked in it and how many it takes. */
interface OpenPool {
  /** A tiered pool's tier, open one tier at a time (a spell level: "Level 1"). */
  level?: string;
  name: string;
  onRemove: (id: string) => void;
  picks: { description?: string | null; id: string; name: string }[];
  room: number;
}

interface PickOptionProps {
  description?: string | null;
  disabled: boolean;
  /** A new page's option fades in, after the ones before it (`fadeInUpSx`'s index). */
  enterIndex?: number;
  /** A family's variant, under its family's row. */
  indented?: boolean;
  name: string;
  onPick: () => void;
  /** What the option asks that the character lacks, shown while it's disabled. */
  requirementTree?: string | null;
}

/** The options the open pool lists, searched and paged on the server. */
interface PickOptions {
  /** How many it shows now. */
  count: number;
  error: unknown;
  fetchingNextPage: boolean;
  loading: boolean;
  onScroll: (event: UIEvent<HTMLElement>) => void;
}

/** A pool's chip: its name and how full it is, picked to open it. */
interface PoolChip {
  key: string;
  label: string;
  onOpen: () => void;
  open: boolean;
}

interface PoolPickerProps {
  /** The open pool's options. */
  children: ReactNode;
  /** What the step grants on its own, above the pools (`AutoGrantedPicks`). */
  granted: ReactNode;
  onSearch: (search: string) => void;
  /** The pool open to pick from, when one is. */
  open: OpenPool | undefined;
  options: PickOptions;
  pools: PoolChip[];
  /** What its pools are, its rules' word ("Aptitude"). */
  poolWord: string;
  search: string;
  /** What it picks, plural ("Feats", "Spells"). */
  what: string;
}

/** The open pool's picks, a line of them that wraps, as tall as a pick while none is made. */
const PICKS_SX = { flexWrap: "wrap", alignItems: "center", minHeight: 32 } as const;

/** An option of the open pool: picked on its click, its description or its missing requirements in its tooltip. */
export function PickOption({
  name,
  description,
  requirementTree,
  disabled,
  onPick,
  indented,
  enterIndex,
}: PickOptionProps) {
  return (
    <OptionTooltip description={description} requirementTree={disabled ? requirementTree : undefined}>
      <Box component="span" sx={[{ display: "block" }, enterIndex !== undefined && fadeInUpSx(enterIndex)]}>
        <ListItemButton sx={[!!indented && { pl: 6 }]} disabled={disabled} onClick={onPick}>
          <ListItemText primary={name} />
        </ListItemButton>
      </Box>
    </OptionTooltip>
  );
}

/**
 * A `pick` step's picks in their pools (3.5's feats and spells alike): the pools' chips, the open pool's picks,
 * and its search over the options it lists.
 */
export function PoolPicker({
  what,
  poolWord,
  granted,
  pools,
  open,
  search,
  onSearch,
  options,
  children,
}: PoolPickerProps) {
  const openName = open && `${poolName(open.name, what)}${open.level ? ` — ${open.level}` : ""}`;
  return (
    <Stack spacing={3} sx={{ flex: 1, minHeight: 0 }}>
      <Stack spacing={1} sx={{ flexShrink: 0 }}>
        <SubsectionTitle>
          Select {what} by {poolWord}
        </SubsectionTitle>
        <Stack spacing={1}>
          {granted}
          {pools.length > 0 && (
            <Stack spacing={0.5}>
              <Typography variant="subtitle1" component="p">
                Choose the {poolWord.toLowerCase()} to select {what.toLowerCase()} from:
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                {pools.map((pool) => (
                  <ChoiceChip
                    key={pool.key}
                    label={pool.label}
                    selected={pool.open}
                    onClick={() => {
                      if (pool.open) return;
                      // A search typed for the last pool would filter this one.
                      onSearch("");
                      pool.onOpen();
                    }}
                  />
                ))}
              </Stack>
            </Stack>
          )}
        </Stack>
      </Stack>
      {open && (
        <Stack spacing={2} sx={{ flex: 1, minHeight: 0 }}>
          <Stack spacing={1} sx={{ flexShrink: 0 }}>
            <SubsectionTitle component="h4">
              Selected {openName} ({open.picks.length}/{open.room}):
            </SubsectionTitle>
            {/* A pick's height kept while none is made, so the search under it stays put as the first lands */}
            <Stack direction="row" spacing={0.5} sx={PICKS_SX}>
              {open.picks.length > 0 ? (
                // A stackable feat can be picked twice in its pool
                open.picks.map((pick, i) => (
                  <OptionTooltip key={`${pick.id}-${i}`} description={pick.description} maxLength={200}>
                    <PickChip label={pick.name} onDelete={() => open.onRemove(pick.id)} />
                  </OptionTooltip>
                ))
              ) : (
                <BlankNote>None selected yet</BlankNote>
              )}
            </Stack>
          </Stack>
          {open.picks.length < open.room && (
            <Stack spacing={1} sx={{ flex: 1, minHeight: 0 }}>
              <TextField
                label={`Search ${openName}`}
                placeholder={`Search ${what.toLowerCase()}…`}
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                fullWidth
                sx={{ flexShrink: 0 }}
              />
              {options.loading && options.count === 0 ? (
                <DiceSpinner />
              ) : options.error && options.count === 0 ? (
                <LoadError what={what} error={options.error} />
              ) : options.count === 0 && search ? (
                <BlankNote>Nothing matches "{search}" — try another search</BlankNote>
              ) : (
                <List dense sx={{ flex: 1, minHeight: 0, overflow: "auto" }} onScroll={options.onScroll}>
                  {children}
                  <NextPageSpinner loading={options.fetchingNextPage} />
                </List>
              )}
            </Stack>
          )}
        </Stack>
      )}
    </Stack>
  );
}
