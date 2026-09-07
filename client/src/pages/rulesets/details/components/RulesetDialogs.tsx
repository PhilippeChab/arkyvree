import type { rpc } from "@/client/src/services/rpc.ts";
import {
  Archive as ArchiveIcon,
  Extension as ExtensionIcon,
  Lock as LockIcon,
  MenuBook as RulesetIcon,
  Public as PublicIcon,
  Publish as PublishIcon,
} from "@mui/icons-material";
import { useEffect, useState } from "react";
import { DiceSpinner, FormDialog, Modal } from "@/client/src/components/common/index.ts";
import {
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import type { InferRequestType } from "hono/client";
import { Controller, type UseFormReturn } from "react-hook-form";

export type EditRulesetFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["$put"]
>["json"];

export type ForkRulesetFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["fork"]["$post"]
>["json"];

interface EditRulesetDialogProps {
  open: boolean;
  onClose: () => void;
  form: UseFormReturn<EditRulesetFormData>;
  onSubmit: (data: EditRulesetFormData) => void;
  isLoading: boolean;
  isPublic: boolean;
  canBeExtension: boolean;
}

export function EditRulesetDialog({
  open,
  onClose,
  form,
  onSubmit,
  isLoading,
  isPublic,
  canBeExtension,
}: EditRulesetDialogProps) {
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      form={form}
      isLoading={isLoading}
    >
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <DialogTitle>
          <Typography component="div" sx={{ fontWeight: 600, typography: { xs: "h6", sm: "h5" } }}>
            Edit Ruleset
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <TextField
              {...form.register("name", { required: "Name is required" })}
              label="Name"
              fullWidth
              error={!!form.formState.errors.name}
              helperText={form.formState.errors.name?.message}
              autoFocus
              disabled={isLoading}
            />
            <TextField
              {...form.register("description")}
              label="Description"
              fullWidth
              multiline
              minRows={4}
              disabled={isLoading}
              sx={{ "& textarea": { resize: "vertical" } }}
            />
            {!isPublic && (
              <Box>
                <Typography variant="subtitle2" gutterBottom sx={{
                  color: "text.secondary"
                }}>
                  Privacy
                </Typography>
                <ToggleButtonGroup
                  value={form.watch("private") ?? false}
                  exclusive
                  onChange={(_, value) => form.setValue("private", value)}
                  disabled={isLoading}
                  size="small"
                >
                  <ToggleButton value={false}>
                    <Stack direction="row" spacing={1} sx={{
                      alignItems: "center"
                    }}>
                      <PublicIcon fontSize="small" />
                      <Typography variant="body2">Public</Typography>
                    </Stack>
                  </ToggleButton>
                  <ToggleButton value>
                    <Stack direction="row" spacing={1} sx={{
                      alignItems: "center"
                    }}>
                      <LockIcon fontSize="small" />
                      <Typography variant="body2">Private</Typography>
                    </Stack>
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
            )}
            {canBeExtension && (
              <Box>
                <Typography variant="subtitle2" gutterBottom sx={{ color: "text.secondary" }}>
                  Publish as
                </Typography>
                <Controller
                  name="kind"
                  control={form.control}
                  defaultValue="ruleset"
                  render={({ field }) => (
                    <ToggleButtonGroup
                      value={field.value ?? "ruleset"}
                      exclusive
                      onChange={(_, value) => value && field.onChange(value)}
                      disabled={isLoading}
                      size="small"
                    >
                      <ToggleButton value="ruleset">
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                          <RulesetIcon fontSize="small" />
                          <Typography variant="body2">Ruleset</Typography>
                        </Stack>
                      </ToggleButton>
                      <ToggleButton value="extension">
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                          <ExtensionIcon fontSize="small" />
                          <Typography variant="body2">Extension</Typography>
                        </Stack>
                      </ToggleButton>
                    </ToggleButtonGroup>
                  )}
                />
                <Typography variant="caption" sx={{ display: "block", mt: 1, color: "text.secondary" }}>
                  Rulesets are playable directly. Extensions are content packs that other rulesets subscribe to.
                </Typography>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={isLoading} variant="outlined" color="inherit">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isLoading}
          >
            <DiceSpinner size="small" loading={isLoading}>Save Changes</DiceSpinner>
          </Button>
        </DialogActions>
      </form>
    </FormDialog>
  );
}

interface ForkRulesetDialogProps {
  open: boolean;
  onClose: () => void;
  form: UseFormReturn<ForkRulesetFormData>;
  onSubmit: (data: ForkRulesetFormData) => void;
  isLoading: boolean;
}

export function ForkRulesetDialog({
  open,
  onClose,
  form,
  onSubmit,
  isLoading,
}: ForkRulesetDialogProps) {
  return (
    <FormDialog
      open={open}
      onClose={onClose}
      form={form}
      isLoading={isLoading}
    >
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <DialogTitle>
          <Typography component="div" sx={{ fontWeight: 600, typography: { xs: "h6", sm: "h5" } }}>
            Fork Ruleset
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <TextField
              {...form.register("name", { required: "Name is required" })}
              label="New Name"
              fullWidth
              error={!!form.formState.errors.name}
              helperText={form.formState.errors.name?.message}
              autoFocus
              disabled={isLoading}
            />
            <TextField
              {...form.register("description")}
              label="Description"
              fullWidth
              multiline
              minRows={4}
              disabled={isLoading}
              sx={{ "& textarea": { resize: "vertical" } }}
            />
            <Box>
              <Typography variant="subtitle2" gutterBottom sx={{
                color: "text.secondary"
              }}>
                Privacy
              </Typography>
              <ToggleButtonGroup
                value={form.watch("private") ?? false}
                exclusive
                onChange={(_, value) => form.setValue("private", value)}
                disabled={isLoading}
                size="small"
              >
                <ToggleButton value={false}>
                  <Stack direction="row" spacing={1} sx={{
                    alignItems: "center"
                  }}>
                    <PublicIcon fontSize="small" />
                    <Typography variant="body2">Public</Typography>
                  </Stack>
                </ToggleButton>
                <ToggleButton value>
                  <Stack direction="row" spacing={1} sx={{
                    alignItems: "center"
                  }}>
                    <LockIcon fontSize="small" />
                    <Typography variant="body2">Private</Typography>
                  </Stack>
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={isLoading} variant="outlined" color="inherit">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isLoading}
          >
            <DiceSpinner size="small" loading={isLoading}>Fork Ruleset</DiceSpinner>
          </Button>
        </DialogActions>
      </form>
    </FormDialog>
  );
}

interface ArchiveRulesetDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}

export function ArchiveRulesetDialog({
  open,
  onClose,
  onConfirm,
  isLoading,
}: ArchiveRulesetDialogProps) {
  return (
    <Modal open={open} onClose={() => !isLoading && onClose()}>
      <DialogTitle>
        <Typography component="div" sx={{ fontWeight: 600, typography: { xs: "h6", sm: "h5" } }}>
          Archive Ruleset
        </Typography>
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          Are you sure you want to archive this ruleset? You can restore it later from the archived
          rulesets section.
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={isLoading} variant="outlined" color="inherit">
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          color="warning"
          disabled={isLoading}
          startIcon={<ArchiveIcon />}
        >
          <DiceSpinner size="small" loading={isLoading}>Archive Ruleset</DiceSpinner>
        </Button>
      </DialogActions>
    </Modal>
  );
}

interface PublishRulesetDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (kind: "ruleset" | "extension") => void;
  isLoading: boolean;
  canBeExtension: boolean;
  initialKind?: "ruleset" | "extension";
}

export function PublishRulesetDialog({
  open,
  onClose,
  onConfirm,
  isLoading,
  canBeExtension,
  initialKind = "ruleset",
}: PublishRulesetDialogProps) {
  const [kind, setKind] = useState<"ruleset" | "extension">(initialKind);

  useEffect(() => {
    if (open) setKind(initialKind);
  }, [open, initialKind]);

  return (
    <Modal open={open} onClose={() => !isLoading && onClose()}>
      <DialogTitle>
        <Typography component="div" sx={{ fontWeight: 600, typography: { xs: "h6", sm: "h5" } }}>
          Publish Ruleset
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <DialogContentText>
            Are you sure you want to publish this ruleset? Once published it becomes forkable by other users and shows up in public listings.
          </DialogContentText>
          {canBeExtension && (
            <Box>
              <Typography variant="subtitle2" gutterBottom sx={{ color: "text.secondary" }}>
                Publish as
              </Typography>
              <ToggleButtonGroup
                value={kind}
                exclusive
                onChange={(_, value) => value && setKind(value)}
                disabled={isLoading}
                size="small"
              >
                <ToggleButton value="ruleset">
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <RulesetIcon fontSize="small" />
                    <Typography variant="body2">Ruleset</Typography>
                  </Stack>
                </ToggleButton>
                <ToggleButton value="extension">
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <ExtensionIcon fontSize="small" />
                    <Typography variant="body2">Extension</Typography>
                  </Stack>
                </ToggleButton>
              </ToggleButtonGroup>
              <Typography variant="caption" sx={{ display: "block", mt: 1, color: "text.secondary" }}>
                Rulesets are playable directly. Extensions are content packs that other rulesets subscribe to.
              </Typography>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={isLoading} variant="outlined" color="inherit">
          Cancel
        </Button>
        <Button
          onClick={() => onConfirm(kind)}
          variant="contained"
          color="success"
          disabled={isLoading}
          startIcon={<PublishIcon />}
        >
          <DiceSpinner size="small" loading={isLoading}>Publish Ruleset</DiceSpinner>
        </Button>
      </DialogActions>
    </Modal>
  );
}

interface UnsubscribeExtensionDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  extensionName: string;
}

export function UnsubscribeExtensionDialog({
  open,
  onClose,
  onConfirm,
  isLoading,
  extensionName,
}: UnsubscribeExtensionDialogProps) {
  return (
    <Modal open={open} onClose={() => !isLoading && onClose()}>
      <DialogTitle>
        <Typography component="div" sx={{ fontWeight: 600, typography: { xs: "h6", sm: "h5" } }}>
          Unsubscribe from Extension
        </Typography>
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          Are you sure you want to unsubscribe from <strong>{extensionName}</strong>? You will
          lose all associated data from this extension.
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={isLoading} variant="outlined" color="inherit">
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          color="error"
          disabled={isLoading}
          startIcon={<ExtensionIcon />}
        >
          <DiceSpinner size="small" loading={isLoading}>Unsubscribe</DiceSpinner>
        </Button>
      </DialogActions>
    </Modal>
  );
}
