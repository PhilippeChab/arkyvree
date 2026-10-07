import { Box, Stack, type SxProps, type Theme } from "@mui/material";
import { type ReactNode } from "react";

import type { useListPageQuery } from "@/client/src/hooks/index.ts";

import { NoMatchesState } from "./BlankState.tsx";
import { LoadError } from "./LoadError.tsx";
import { LoadMoreButton } from "./LoadMoreButton.tsx";
import { PageLoader } from "./PageLoader.tsx";

/** A list page's query, as `useListPageQuery` gives it. */
type ListPageQuery = ReturnType<typeof useListPageQuery>;

interface ListPageResultsProps {
  /** The loaded list: a `ListCardGrid` of cards, or a table in its `TableFrame`. */
  children: ReactNode;
  /** The list's own empty state (a `BlankState`), when it holds nothing and no search runs. */
  empty: ReactNode;
  /** The empty states' spacing, where a page sets them apart from its table's place (`pt`). */
  emptySx?: SxProps<Theme>;
  /** The page's query (`useListPageQuery`). */
  list: ListPageQuery;
  /** The search that runs, if any: when it found nothing, a `NoMatchesState`. */
  search: string;
  /** What it lists, as its load failure names it: "Characters". */
  what: string;
}

/**
 * A list page's results, below its search bar: its first load, its failure while nothing has loaded, what a search
 * found nothing for or its own empty state, else the list and the foot that loads its next page.
 */
export function ListPageResults({ children, empty, emptySx, list, search, what }: ListPageResultsProps) {
  if (list.isLoading) return <PageLoader />;
  if (list.error && list.items.length === 0) return <LoadError what={what} error={list.error} />;
  if (list.items.length === 0) return <Box sx={emptySx}>{search ? <NoMatchesState search={search} /> : empty}</Box>;
  return (
    // With nothing more to load, the page ends three units below the list
    <Stack spacing={2} sx={{ pb: list.hasNextPage ? 0 : 3 }}>
      {children}
      <LoadMoreButton
        size="large"
        hasNextPage={list.hasNextPage}
        isFetchingNextPage={list.isFetchingNextPage}
        onClick={list.loadMore}
      />
    </Stack>
  );
}
