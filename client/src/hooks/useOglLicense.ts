import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/client/src/lib/queryKeys.ts";

/** Text of the Open Game License, served as a static file. */
export function useOglLicense(enabled = true) {
  return useQuery({
    queryKey: queryKeys.legal.ogl,
    queryFn: async ({ signal }) => {
      const response = await fetch("/legal/ogl-1.0a.md", { signal });
      if (!response.ok) throw new Error("Failed to load the license text");
      return response.text();
    },
    enabled,
    staleTime: Infinity,
  });
}
