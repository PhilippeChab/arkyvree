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

import { ConfirmDialog, DiceSpinner, Modal } from "@/client/src/components/common/index.ts";
import { CopyIcon, RefreshIcon, UnlinkIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

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
      return parseResponse(
        rpc.api.characters[":id"]["share"]["$post"]({
          param: { id: characterId },
        }),
      );
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
      return parseResponse(
        rpc.api.characters[":id"]["share"]["$delete"]({
          param: { id: characterId },
        }),
      );
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
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Anyone with this link can view this character sheet and download the PDF. Private notes are not
                included.
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
                        <IconButton onClick={handleCopy} edge="end" size="small" aria-label="Copy link">
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
                  <DiceSpinner size="small" loading={generateMutation.isPending}>
                    Regenerate
                  </DiceSpinner>
                </Button>
                <Button
                  variant="contained"
                  size="small"
                  color="error"
                  startIcon={<UnlinkIcon />}
                  onClick={() => setConfirmRevoke(true)}
                  disabled={isLoading}
                >
                  Revoke Link
                </Button>
              </Stack>
            </>
          ) : (
            <>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Generate a public link to share this character sheet. Anyone with the link will be able to view the
                sheet and download the PDF. Private notes will not be visible.
              </Typography>
              <Button variant="contained" onClick={() => generateMutation.mutate()} disabled={isLoading}>
                <DiceSpinner size="small" loading={generateMutation.isPending}>
                  Generate Link
                </DiceSpinner>
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
      <ConfirmDialog
        open={confirmRevoke}
        onClose={() => setConfirmRevoke(false)}
        onConfirm={() => revokeMutation.mutate()}
        isLoading={revokeMutation.isPending}
        title="Revoke Link"
        message="Are you sure you want to revoke this share link? Anyone who has it loses access."
        confirmLabel="Revoke Link"
        confirmColor="error"
      />
    </Modal>
  );
}
