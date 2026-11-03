import { IconButton, Stack, Typography } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { DiceSpinner } from "@/client/src/components/common/index.ts";
import { StarBorderIcon, StarIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import type { RulesetListItem } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

interface RulesetStarButtonProps {
  /** Where it stands: a card's corner, its stars counted before it, or beside its page's title, the star alone */
  placement: "card" | "title";
  ruleset: Pick<RulesetListItem, "id" | "isStarred" | "starCount">;
}

/** Stars a ruleset, or unstars it: one toggle on its card and in its page's header, its star rolling while it's sent. */
export function RulesetStarButton({ ruleset, placement }: RulesetStarButtonProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const starMutation = useMutation({
    // Whether it was starred as it was clicked: a click unstars a starred one
    mutationFn: async ({ id, starred }: { id: string; starred: boolean }) => {
      const param = { param: { id } };
      await (starred
        ? parseResponse(rpc.api.rulesets[":id"].star.$delete(param))
        : parseResponse(rpc.api.rulesets[":id"].star.$post(param)));
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rulesets.lists });
      // Only the ruleset's own record shows the star; its sections share the key prefix.
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rulesets.detail(id), exact: true });
    },
    onError: (error, { starred }) =>
      snackbar.error(error, starred ? "Failed to unstar ruleset" : "Failed to star ruleset"),
  });

  const button = (
    <IconButton
      size="small"
      aria-label="Star Ruleset"
      aria-pressed={ruleset.isStarred}
      onClick={() => starMutation.mutate({ id: ruleset.id, starred: ruleset.isStarred })}
      disabled={starMutation.isPending}
      sx={[
        { color: ruleset.isStarred ? "warning.main" : "action.disabled", "&:hover": { color: "warning.main" } },
        // Beside the title, the star stands bare, as tall as its line
        placement === "title" && { flexShrink: 0, p: 0, "&:hover": { bgcolor: "transparent" } },
      ]}
    >
      <DiceSpinner size="small" loading={starMutation.isPending}>
        {ruleset.isStarred ? <StarIcon fontSize="medium" /> : <StarBorderIcon fontSize="medium" />}
      </DiceSpinner>
    </IconButton>
  );

  if (placement === "title") return button;

  return (
    <Stack direction="row" spacing={0.25} sx={{ alignItems: "center" }}>
      {ruleset.starCount > 0 && (
        <Typography variant="caption" sx={{ color: "warning.main", fontWeight: 600, lineHeight: 1 }}>
          {ruleset.starCount}
        </Typography>
      )}
      {button}
    </Stack>
  );
}
