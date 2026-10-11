/** The Open Game License's text, which `OglLicenseText` alone reads, wherever it shows. */

import { queryOptions } from "@tanstack/react-query";

import { FOREVER } from "@/client/src/lib/durations.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";

/** The text of the Open Game License, a static file that never changes. */
export function oglLicenseQuery() {
  return queryOptions({
    queryKey: QUERY_KEYS.legal.ogl,
    queryFn: async ({ signal }) => {
      const response = await fetch("/legal/ogl-1.0a.md", { signal });
      if (!response.ok) throw new Error("Failed to load the license text");
      return response.text();
    },
    staleTime: FOREVER,
  });
}
