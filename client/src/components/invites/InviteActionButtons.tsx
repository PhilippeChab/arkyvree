import { Button, Stack } from "@mui/material";

import { CheckIcon, CloseIcon } from "@/client/src/components/icons/index.ts";

interface InviteActionButtonsProps {
  onAccept: () => void;
  onReject: () => void;
  disabled?: boolean;
  /** Full-width buttons for an invite page, instead of small inline ones. */
  prominent?: boolean;
}

/** Accept / Reject pair for an invitation (see docs/ui-buttons.md → pair patterns). */
export function InviteActionButtons({ onAccept, onReject, disabled, prominent = false }: InviteActionButtonsProps) {
  const size = prominent ? "medium" : "small";
  return (
    <Stack direction="row" spacing={prominent ? 2 : 1}>
      <Button
        size={size}
        fullWidth={prominent}
        variant="contained"
        color="success"
        startIcon={<CheckIcon />}
        onClick={onAccept}
        disabled={disabled}
      >
        Accept
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
        Reject
      </Button>
    </Stack>
  );
}
