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
import { ConfirmDialog, CreateDialog, EditDialog } from "@/client/src/components/common/index.ts";
import {
  Box,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import type { InferRequestType } from "hono/client";
import { type UseFormReturn } from "react-hook-form";

export type EditRulesetFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["$put"]
>["json"];

export type ForkRulesetFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["fork"]["$post"]
>["json"];

type RulesetKind = NonNullable<InferRequestType<(typeof rpc.api.rulesets)[":id"]["publish"]["$post"]>["json"]["kind"]>;

/** Public / Private choice; the selected option can't be toggled off. */
function PrivacyToggle({ value, onChange, disabled }: {
  value: boolean;
  onChange: (isPrivate: boolean) => void;
  disabled: boolean;
}) {
  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom sx={{ color: "text.secondary" }}>
        Privacy
      </Typography>
      <ToggleButtonGroup
        value={value}
        exclusive
        onChange={(_, next: boolean | null) => next !== null && onChange(next)}
        disabled={disabled}
        size="small"
      >
        <ToggleButton value={false}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <PublicIcon fontSize="small" />
            <Typography variant="body2">Public</Typography>
          </Stack>
        </ToggleButton>
        <ToggleButton value>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <LockIcon fontSize="small" />
            <Typography variant="body2">Private</Typography>
          </Stack>
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
}

/** Ruleset / Extension choice made when publishing; the selected option can't be toggled off. */
function RulesetKindToggle({ value, onChange, disabled }: {
  value: RulesetKind;
  onChange: (kind: RulesetKind) => void;
  disabled: boolean;
}) {
  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom sx={{ color: "text.secondary" }}>
        Publish as
      </Typography>
      <ToggleButtonGroup
        value={value}
        exclusive
        onChange={(_, next: RulesetKind | null) => next && onChange(next)}
        disabled={disabled}
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
  );
}

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
    <EditDialog
      open={open}
      onClose={onClose}
      title="Edit Ruleset"
      form={form}
      onSubmit={onSubmit}
      isLoading={isLoading}
      submitLabel="Save Changes"
    >
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
        <PrivacyToggle
          value={form.watch("private") ?? false}
          onChange={(isPrivate) => form.setValue("private", isPrivate, { shouldDirty: true })}
          disabled={isLoading}
        />
      )}
      {canBeExtension && (
        <RulesetKindToggle
          value={form.watch("kind") ?? "ruleset"}
          onChange={(kind) => form.setValue("kind", kind, { shouldDirty: true })}
          disabled={isLoading}
        />
      )}
    </EditDialog>
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
    <CreateDialog
      open={open}
      onClose={onClose}
      title="Fork Ruleset"
      form={form}
      onSubmit={onSubmit}
      isLoading={isLoading}
      submitLabel="Fork Ruleset"
    >
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
      <PrivacyToggle
        value={form.watch("private") ?? false}
        onChange={(isPrivate) => form.setValue("private", isPrivate, { shouldDirty: true })}
        disabled={isLoading}
      />
    </CreateDialog>
  );
}

interface ArchiveRulesetDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}

export function ArchiveRulesetDialog({ open, onClose, onConfirm, isLoading }: ArchiveRulesetDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      isLoading={isLoading}
      title="Archive Ruleset"
      message="Are you sure you want to archive this ruleset? You can restore it later from the archived rulesets section."
      confirmLabel="Archive Ruleset"
      confirmColor="warning"
      confirmIcon={<ArchiveIcon />}
    />
  );
}

interface PublishRulesetDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (kind: RulesetKind) => void;
  isLoading: boolean;
  canBeExtension: boolean;
  initialKind?: RulesetKind;
}

export function PublishRulesetDialog({
  open,
  onClose,
  onConfirm,
  isLoading,
  canBeExtension,
  initialKind = "ruleset",
}: PublishRulesetDialogProps) {
  const [kind, setKind] = useState<RulesetKind>(initialKind);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    if (open) setKind(initialKind);
  }, [open, initialKind]);

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={() => onConfirm(kind)}
      isLoading={isLoading}
      title="Publish Ruleset"
      message="Are you sure you want to publish this ruleset? Once published it becomes forkable by other users and shows up in public listings."
      confirmLabel="Publish Ruleset"
      confirmColor="success"
      confirmIcon={<PublishIcon />}
    >
      {canBeExtension && (
        <Box sx={{ mt: 2 }}>
          <RulesetKindToggle value={kind} onChange={setKind} disabled={isLoading} />
        </Box>
      )}
    </ConfirmDialog>
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
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      isLoading={isLoading}
      title="Unsubscribe from Extension"
      message={<>Are you sure you want to unsubscribe from <strong>{extensionName}</strong>? You will lose all associated data from this extension.</>}
      confirmLabel="Unsubscribe"
      confirmColor="error"
      confirmIcon={<ExtensionIcon />}
    />
  );
}
