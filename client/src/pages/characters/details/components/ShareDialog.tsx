import { Modal } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import {
  ContentCopy as CopyIcon,
  LinkOff as LinkOffIcon,
  Refresh as RefreshIcon,
} from "@mui/icons-material";
import {
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  characterId: string;
  shareToken: string | null;
}

export function ShareDialog({ open, onClose, characterId, shareToken }: ShareDialogProps) {
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const shareUrl = shareToken ? `${window.location.origin}/share/${shareToken}` : null;

  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await rpc.api.characters[":id"]["share"]["$post"]({
        param: { id: characterId },
      });
      if (!response.ok) throw new Error("Failed to generate share link");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characters.detail(characterId) });
      snackbar.success("Share link generated");
    },
    onError: (err) => {
      snackbar.error(err, "Failed to generate share link");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async () => {
      const response = await rpc.api.characters[":id"]["share"]["$delete"]({
        param: { id: characterId },
      });
      if (!response.ok) throw new Error("Failed to revoke share link");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.characters.detail(characterId) });
      setConfirmRevoke(false);
      snackbar.success("Share link revoked");
    },
    onError: (err) => {
      snackbar.error(err, "Failed to revoke share link");
    },
  });

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      snackbar.success("Link copied to clipboard");
    } catch (err) {
      snackbar.error(err, "Failed to copy link");
    }
  };

  const isLoading = generateMutation.isPending || revokeMutation.isPending;

  return (
    <Modal open={open} onClose={() => !isLoading && onClose()}>
      <DialogTitle>Share Character Sheet</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {shareUrl ? (
            <>
              <Typography variant="body2" sx={{
                color: "text.secondary"
              }}>
                Anyone with this link can view this character sheet and download the PDF. Private notes are not included.
              </Typography>
              <TextField
                value={shareUrl}
                fullWidth
                size="small"
                slotProps={{
                  input: {
                    readOnly: true,
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={handleCopy} edge="end" size="small">
                          <CopyIcon fontSize="small" />
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<RefreshIcon />}
                  onClick={() => generateMutation.mutate()}
                  disabled={isLoading}
                >
                  Regenerate
                </Button>
                {confirmRevoke ? (
                  <Stack direction="row" spacing={1} sx={{
                    alignItems: "center"
                  }}>
                    <Typography variant="body2" sx={{
                      color: "text.secondary"
                    }}>
                      Are you sure?
                    </Typography>
                    <Button
                      variant="contained"
                      size="small"
                      color="error"
                      onClick={() => revokeMutation.mutate()}
                      disabled={isLoading}
                    >
                      Revoke
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="inherit"
                      onClick={() => setConfirmRevoke(false)}
                      disabled={isLoading}
                    >
                      Cancel
                    </Button>
                  </Stack>
                ) : (
                  <Button
                    variant="outlined"
                    size="small"
                    color="error"
                    startIcon={<LinkOffIcon />}
                    onClick={() => setConfirmRevoke(true)}
                    disabled={isLoading}
                  >
                    Revoke Link
                  </Button>
                )}
              </Stack>
            </>
          ) : (
            <>
              <Typography variant="body2" sx={{
                color: "text.secondary"
              }}>
                Generate a public link to share this character sheet. Anyone with the link will be able to view the sheet and download the PDF. Private notes will not be visible.
              </Typography>
              <Button
                variant="contained"
                onClick={() => generateMutation.mutate()}
                disabled={isLoading}
              >
                {isLoading ? "Generating..." : "Generate Link"}
              </Button>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading} variant="outlined" color="inherit">
          Close
        </Button>
      </DialogActions>
    </Modal>
  );
}
