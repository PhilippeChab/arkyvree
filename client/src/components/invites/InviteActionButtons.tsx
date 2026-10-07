import { Button, Stack, type SxProps, type Theme } from "@mui/material";

import { DiceSpinner } from "@/client/src/components/common/index.ts";
import { CheckIcon, CloseIcon } from "@/client/src/components/icons/index.ts";

interface InviteActionButtonsProps {
  onAccept: () => void;
  onReject: () => void;
  /** The answer being sent: its button shows it running, and both wait. */
  pending?: "accept" | "reject" | null;
  /** Full-width buttons for an invite page, instead of small inline ones. */
  prominent?: boolean;
  sx?: SxProps<Theme>;
}

/** Accept / Reject pair for an invitation (see docs/ui-buttons.md → pair patterns). */
export function InviteActionButtons({
  onAccept,
  onReject,
  pending = null,
  prominent = false,
  sx,
}: InviteActionButtonsProps) {
  const size = prominent ? "medium" : "small";
  const disabled = pending !== null;
  return (
    <Stack direction="row" spacing={prominent ? 2 : 1} sx={sx}>
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
    </Stack>
  );
}
