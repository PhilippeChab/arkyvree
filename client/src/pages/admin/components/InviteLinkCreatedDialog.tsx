import {
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
} from "@mui/material";

import { DialogFooter, Modal } from "@/client/src/components/common/index.ts";
import { CopyIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { formatDate } from "@/client/src/lib/formatDate.ts";

import type { CreatedInviteLink } from "./CreateInviteLinkDialog.tsx";

interface InviteLinkCreatedDialogProps {
  link: CreatedInviteLink | null;
  onClose: () => void;
  onExited: () => void;
  open: boolean;
}

/** A new invite link, shown once: the app keeps no copy of its token, so it's copied now or another link is made. */
export function InviteLinkCreatedDialog({ link, open, onClose, onExited }: InviteLinkCreatedDialogProps) {
  const snackbar = useSnackbar();
  const url = link ? `${window.location.origin}/sign-up?invite=${link.token}` : "";
  const expires = link ? formatDate(link.expiresAt) : "it expires";

  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(url);
      snackbar.success("Link copied to clipboard");
    } catch (error) {
      snackbar.error(error, "Failed to copy link");
    }
  };

  return (
    // Closed by its Close alone: a stray click or Escape would lose the link, which the app keeps no copy of
    <Modal open={open} slotProps={{ transition: { onExited } }}>
      <DialogTitle>Invite Link Created</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <DialogContentText>
            Copy this link now: it won't be shown again. It works until {expires}, or until you revoke it.
          </DialogContentText>
          <TextField
            value={url}
            label="Invite Link"
            fullWidth
            size="small"
            slotProps={{
              input: {
                readOnly: true,
                sx: { fontFamily: "monospace" },
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={handleCopy} edge="end" size="small" aria-label="Copy Link">
                      <CopyIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
        </Stack>
      </DialogContent>
      <DialogFooter onCancel={onClose} cancelLabel="Close" />
    </Modal>
  );
}
