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

interface LinkCreatedDialogProps {
  /** Its field's label: the kind of link. */
  label: string;
  /** What it says of the link: how long it works, and what for. */
  message: string;
  onClose: () => void;
  onExited: () => void;
  open: boolean;
  title: string;
  /** The link, none once the dialog has closed. */
  url: string | null;
}

/**
 * A link an admin just made, shown once (an invite link, a password reset link): the app keeps no copy of its token, so
 * it's copied now or another is made.
 */
export function LinkCreatedDialog({ url, title, label, message, open, onClose, onExited }: LinkCreatedDialogProps) {
  const snackbar = useSnackbar();

  const handleCopy = async () => {
    if (!url) return;
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
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <DialogContentText>{message}</DialogContentText>
          <TextField
            value={url ?? ""}
            label={label}
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
