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

import type { CreatedApiKey } from "./CreateApiKeyDialog.tsx";

interface ApiKeyTokenDialogProps {
  apiKey: CreatedApiKey | null;
  onClose: () => void;
  onExited: () => void;
  open: boolean;
}

/** A new key's token, shown once: the app keeps no copy of it, so it's copied now or the key is made again. */
export function ApiKeyTokenDialog({ apiKey, open, onClose, onExited }: ApiKeyTokenDialogProps) {
  const snackbar = useSnackbar();

  const handleCopy = async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey.token);
      snackbar.success("Key copied to clipboard");
    } catch (error) {
      snackbar.error(error, "Failed to copy key");
    }
  };

  return (
    // Closed by its Close alone: a stray click or Escape would lose the token, which the app keeps no copy of
    <Modal open={open} slotProps={{ transition: { onExited } }}>
      <DialogTitle>API Key Created</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <DialogContentText>
            Copy this key now: it won't be shown again. Send it as <code>Authorization: Bearer &lt;key&gt;</code> to the
            public API, under <code>/v1</code>.
          </DialogContentText>
          <TextField
            value={apiKey?.token ?? ""}
            label={apiKey?.name}
            fullWidth
            size="small"
            slotProps={{
              input: {
                readOnly: true,
                sx: { fontFamily: "monospace" },
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={handleCopy} edge="end" size="small" aria-label="Copy Key">
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
