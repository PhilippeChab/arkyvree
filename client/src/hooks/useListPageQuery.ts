import {
  type DefaultError,
  type InfiniteData,
  keepPreviousData,
  type QueryKey,
  useInfiniteQuery,
  type UseInfiniteQueryOptions,
} from "@tanstack/react-query";
import { useMemo } from "react";

import { type ListPage, pageItems } from "@/client/src/lib/pageItems.ts";

import { useStaggerAnimation } from "./useStaggerAnimation.ts";

/**
 * A list page's infinite query (the rulesets, characters, campaigns, notifications, activities, and a campaign's
 * characters tab, a grid of cards too): the items loaded so far (the same array until a page comes in), kept while
 * another search, filter or sort loads, its state, the offset its cards stagger in from, and `loadMore`, which marks
 * where the next page starts before fetching it. `ListPageResults` shows a page's.
 */
export function useListPageQuery<
  TPage extends ListPage,
  TKey extends QueryKey,
  TPageParam,
  TData extends InfiniteData<TPage, unknown> = InfiniteData<TPage, TPageParam>,
>(options: UseInfiniteQueryOptions<TPage, DefaultError, TData, TKey, TPageParam>) {
  const { offset, updateOffset } = useStaggerAnimation(options.queryKey);
  const { data, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery({
    ...options,
    placeholderData: keepPreviousData,
  });
  const items = useMemo(() => pageItems<TPage["items"][number]>(data), [data]);
  const loadMore = () => {
    updateOffset(items.length);
    void fetchNextPage();
  };
  return { items, isLoading, error, hasNextPage, isFetchingNextPage, offset, loadMore };
}
