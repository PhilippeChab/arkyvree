import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import type { TargetPath } from "@/shared/customization/target.ts";

/** What a complete target path takes: its value type, operators and values. */
export type PathInfo = Pick<
  TargetPath,
  "path" | "valueType" | "operators" | "possibleValues" | "setValues" | "literalOnly"
>;

/** What a target path takes, read from its definition or from the completion it was picked from. */
export function toPathInfo({ path, valueType, operators, possibleValues, setValues, literalOnly }: PathInfo): PathInfo {
  return { path, valueType, operators, possibleValues, setValues, literalOnly };
}

/**
 * What the path a modifier or requirement targets takes, once it's a complete path its entity type takes; null while
 * it's incomplete or unknown. `pick` remembers a path picked from a list, which carried what it takes, so it shows at
 * once.
 */
export function useTargetPath(
  rulesetId: string,
  kind: "modifier" | "requirement",
  entityType: string | undefined,
  path: string,
) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: queryKeys.rulesets.targetPath(rulesetId, kind, path, entityType),
    queryFn: path
      ? async () => {
          const { target } = await parseResponse(
            rpc.api.rulesets[":id"].customization["target"].paths.validate.$post({
              param: { id: rulesetId },
              json: { path, kind, entityType: entityType || undefined },
            }),
          );
          return target ? toPathInfo(target) : null;
        }
      : skipToken,
  });
  const pick = (picked: PathInfo) =>
    queryClient.setQueryData(queryKeys.rulesets.targetPath(rulesetId, kind, picked.path, entityType), picked);
  return { target: data ?? null, pick };
}
