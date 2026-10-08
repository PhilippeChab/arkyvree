import { Box, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { InferRequestType } from "hono/client";
import { Controller, type UseFormReturn } from "react-hook-form";

import {
  ConfirmDialog,
  CreateDialog,
  DescriptionField,
  EditDialog,
  NameField,
} from "@/client/src/components/common/index.ts";
import {
  ArchiveIcon,
  ExtensionIcon,
  PrivateIcon,
  PublicIcon,
  PublishIcon,
  RulesetIcon,
} from "@/client/src/components/icons/index.ts";
import { NAME_RULES } from "@/client/src/lib/validation.ts";
import type { PublishKind } from "@/client/src/pages/rulesets/hooks/index.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

interface ArchiveRulesetDialogProps {
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
}

interface EditRulesetDialogProps {
  canBeExtension: boolean;
  form: UseFormReturn<EditRulesetFormData>;
  isLoading: boolean;
  isPublic: boolean;
  onClose: () => void;
  onSubmit: (data: EditRulesetFormData) => void;
  open: boolean;
}

interface ForkRulesetDialogProps {
  form: UseFormReturn<ForkRulesetFormData>;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (data: ForkRulesetFormData) => void;
  open: boolean;
}

interface PrivacyToggleProps {
  disabled: boolean;
  onChange: (isPrivate: boolean) => void;
  value: boolean;
}

interface PublishRulesetDialogProps {
  canBeExtension: boolean;
  isLoading: boolean;
  /** What it's published as, which its opener sets to the ruleset's kind */
  kind: PublishKind;
  onClose: () => void;
  onConfirm: (kind: PublishKind) => void;
  onKindChange: (kind: PublishKind) => void;
  open: boolean;
}

interface RulesetKindToggleProps {
  disabled: boolean;
  onChange: (kind: PublishKind) => void;
  value: PublishKind;
}

interface UnsubscribeExtensionDialogProps {
  extensionName: string;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
}

export type EditRulesetFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["$put"]>["json"];

export type ForkRulesetFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["fork"]["$post"]>["json"];

/** Public / Private choice; the selected option can't be toggled off. */
function PrivacyToggle({ value, onChange, disabled }: PrivacyToggleProps) {
  return (
    <Box>
      <Typography variant="subtitle2" component="p" gutterBottom sx={{ color: "text.secondary" }}>
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
            <PrivateIcon fontSize="small" />
            <Typography variant="body2">Private</Typography>
          </Stack>
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
}

/** Ruleset / Extension choice made when publishing; the selected option can't be toggled off. */
function RulesetKindToggle({ value, onChange, disabled }: RulesetKindToggleProps) {
  return (
    <Box>
      <Typography variant="subtitle2" component="p" gutterBottom sx={{ color: "text.secondary" }}>
        Publish as
      </Typography>
      <Stack spacing={1} sx={{ alignItems: "flex-start" }}>
        <ToggleButtonGroup
          value={value}
          exclusive
          onChange={(_, next: PublishKind | null) => next && onChange(next)}
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
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Rulesets are playable directly. Extensions are content packs that other rulesets subscribe to.
        </Typography>
      </Stack>
    </Box>
  );
}

export function ArchiveRulesetDialog({ open, onClose, onConfirm, isLoading }: ArchiveRulesetDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      isLoading={isLoading}
      title="Archive Ruleset"
      message="Are you sure you want to archive this ruleset? You can unarchive it at any time from the Archived filter."
      confirmLabel="Archive Ruleset"
      intent="caution"
      confirmIcon={<ArchiveIcon />}
    />
  );
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
    >
      <NameField control={form.control} name="name" rules={NAME_RULES} autoFocus disabled={isLoading} />
      <DescriptionField control={form.control} name="description" disabled={isLoading} rows={4} />
      {!isPublic && (
        <Controller
          control={form.control}
          name="private"
          render={({ field }) => (
            <PrivacyToggle value={field.value ?? false} onChange={field.onChange} disabled={isLoading} />
          )}
        />
      )}
      {canBeExtension && (
        <Controller
          control={form.control}
          name="kind"
          render={({ field }) => (
            <RulesetKindToggle value={field.value ?? "ruleset"} onChange={field.onChange} disabled={isLoading} />
          )}
        />
      )}
    </EditDialog>
  );
}

export function ForkRulesetDialog({ open, onClose, form, onSubmit, isLoading }: ForkRulesetDialogProps) {
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
      <NameField
        control={form.control}
        name="name"
        rules={NAME_RULES}
        label="New Name"
        autoFocus
        disabled={isLoading}
      />
      <DescriptionField control={form.control} name="description" disabled={isLoading} rows={4} />
      <Controller
        control={form.control}
        name="private"
        render={({ field }) => (
          <PrivacyToggle value={field.value ?? false} onChange={field.onChange} disabled={isLoading} />
        )}
      />
    </CreateDialog>
  );
}

export function PublishRulesetDialog({
  open,
  onClose,
  onConfirm,
  isLoading,
  canBeExtension,
  kind,
  onKindChange,
}: PublishRulesetDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={() => onConfirm(kind)}
      isLoading={isLoading}
      title="Publish Ruleset"
      message="Are you sure you want to publish this ruleset? Once published, other users can find it and use it, unless it's private."
      confirmLabel="Publish Ruleset"
      intent="positive"
      confirmIcon={<PublishIcon />}
    >
      {canBeExtension && (
        // Its room below the dialog's question
        <Box sx={{ pt: 2 }}>
          <RulesetKindToggle value={kind} onChange={onKindChange} disabled={isLoading} />
        </Box>
      )}
    </ConfirmDialog>
  );
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
      message={
        <>
          Are you sure you want to unsubscribe from <strong>{extensionName}</strong>? You will lose all associated data
          from this extension.
        </>
      }
      confirmLabel="Unsubscribe"
      intent="destructive"
      confirmIcon={<ExtensionIcon />}
    />
  );
}
