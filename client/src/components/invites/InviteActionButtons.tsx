import { Button, Stack, Typography } from "@mui/material";

import { DiceSpinner } from "@/client/src/components/common/index.ts";
import { CheckIcon, CloseIcon } from "@/client/src/components/icons/index.ts";

import type { InviteVerb } from "./inviteKinds.ts";

interface InviteActionButtonsProps {
  /** Accepting it: none for an invite its invitee can't accept, whose Reject stands alone. */
  onAccept?: () => void;
  onReject: () => void;
  /** The answer being sent: its button shows it running, and both wait. */
  pending?: InviteVerb | null;
  /** Full-width buttons for an invite page, instead of small inline ones. */
  prominent?: boolean;
  /** Why it can't be accepted, beside its Reject alone: a notification's, which has no invite page's card to say it. */
  refusal?: string | null;
}

/**
 * Accept / Reject pair for an invite (see docs/ui-buttons.md → pair patterns), or Reject alone (no `onAccept`), and why
 * (`refusal`).
 */
export function InviteActionButtons({
  onAccept,
  onReject,
  pending = null,
  prominent = false,
  refusal = null,
}: InviteActionButtonsProps) {
  const size = prominent ? "medium" : "small";
  const disabled = pending !== null;
  return (
    <Stack direction="row" spacing={prominent ? 2 : 1} sx={{ alignItems: "center" }}>
      {onAccept && (
        <Button
          size={size}
          fullWidth={prominent}
          variant="contained"
          color="success"
          startIcon={<CheckIcon />}
          onClick={onAccept}
          disabled={disabled}
        >
          <DiceSpinner size="small" loading={pending === "accept"}>
            Accept
          </DiceSpinner>
        </Button>
      )}
      <Button
        size={size}
        fullWidth={prominent}
        variant="contained"
        color="error"
        startIcon={<CloseIcon />}
        onClick={onReject}
        disabled={disabled}
      >
        <DiceSpinner size="small" loading={pending === "reject"}>
          Reject
        </DiceSpinner>
      </Button>
      {!onAccept && refusal && (
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {refusal}
        </Typography>
      )}
    </Stack>
  );
}
