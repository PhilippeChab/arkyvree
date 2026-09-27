import { createListboxScrollHandler } from "@/client/src/lib/listboxScroll.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import {
  type DefaultError,
  type InfiniteData,
  type QueryKey,
  useInfiniteQuery,
  type UseInfiniteQueryOptions,
} from "@tanstack/react-query";
import { useMemo } from "react";

/** A page of a paginated list endpoint. */
interface ListPage {
  items: unknown[];
  nextPage?: number | null;
}

/**
 * An infinite query behind a listbox (an Autocomplete's or a Select's options):
 * the items loaded so far, and the `onScroll` that fetches the next page near the
 * bottom. Give the listbox `ScrollSafeListbox` so the new options keep the scroll.
 */
export function useListboxQuery<
  TPage extends ListPage,
  TKey extends QueryKey,
  TPageParam,
  TData extends InfiniteData<TPage, unknown> = InfiniteData<TPage, TPageParam>,
>(options: UseInfiniteQueryOptions<TPage, DefaultError, TData, TKey, TPageParam>) {
  const { data, isLoading, isPending, isPlaceholderData, isError, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteQuery(options);
  const items = useMemo(() => pageItems<TPage["items"][number]>(data), [data]);
  const onScroll = createListboxScrollHandler({ hasNextPage, isFetchingNextPage, fetchNextPage });
  return { items, onScroll, isLoading, isPending, isPlaceholderData, isError, isFetchingNextPage };
}
