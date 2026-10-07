import { useQuery } from "@tanstack/react-query";

import { oglLicenseQuery } from "@/client/src/lib/queries.ts";

/** Text of the Open Game License, served as a static file. */
export function useOglLicense(enabled = true) {
  return useQuery({ ...oglLicenseQuery(), enabled });
}
