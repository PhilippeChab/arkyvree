import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

export function usePrefetch<T>(
  queryKey: readonly unknown[],
  queryFn: () => Promise<T>,
) {
  const queryClient = useQueryClient();

  const prefetch = useCallback(() => {
    queryClient.prefetchQuery({ queryKey, queryFn });
  }, [queryClient, queryKey, queryFn]);

  return { onMouseEnter: prefetch, onFocus: prefetch };
}
