import { Box } from "@mui/material";
import type { InferRequestType } from "hono/client";
import { Controller, type UseFormReturn } from "react-hook-form";

import {
  ConfirmDialog,
  CreateDialog,
  DescriptionField,
  EditDialog,
  NameField,
  OptionToggle,
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
  /** Who archives it can unarchive it too: its owner. An Admin archives it, but only its owner brings it back. */
  canUnarchive: boolean;
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

interface UnsubscribeExtensionDialogProps {
  extensionName: string;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
}

export type EditRulesetFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["$put"]>["json"];

export type ForkRulesetFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["fork"]["$post"]>["json"];

/** What publishing as each kind means */
const KIND_CAPTION = "Rulesets are playable directly. Extensions are content packs that other rulesets subscribe to.";

/** What a ruleset is published as: one to play, or an extension other rulesets subscribe to */
const KIND_OPTIONS = [
  { value: "ruleset", label: "Ruleset", icon: RulesetIcon },
  { value: "extension", label: "Extension", icon: ExtensionIcon },
] as const;

/** A ruleset's privacy: public, or private */
const PRIVACY_OPTIONS = [
  { value: false, label: "Public", icon: PublicIcon },
  { value: true, label: "Private", icon: PrivateIcon },
] as const;

export function ArchiveRulesetDialog({ open, onClose, onConfirm, isLoading, canUnarchive }: ArchiveRulesetDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      isLoading={isLoading}
      title="Archive Ruleset"
      message={
        canUnarchive
          ? "Are you sure you want to archive this ruleset? You can unarchive it at any time from the Archived filter."
          : "Are you sure you want to archive this ruleset? Only its owner can unarchive it."
      }
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
            <OptionToggle
              label="Privacy"
              options={PRIVACY_OPTIONS}
              value={field.value ?? false}
              onChange={field.onChange}
              disabled={isLoading}
            />
          )}
        />
      )}
      {canBeExtension && (
        <Controller
          control={form.control}
          name="kind"
          render={({ field }) => (
            <OptionToggle
              label="Publish as"
              options={KIND_OPTIONS}
              caption={KIND_CAPTION}
              value={field.value ?? "ruleset"}
              onChange={field.onChange}
              disabled={isLoading}
            />
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
          <OptionToggle
            label="Privacy"
            options={PRIVACY_OPTIONS}
            value={field.value ?? false}
            onChange={field.onChange}
            disabled={isLoading}
          />
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
          <OptionToggle
            label="Publish as"
            options={KIND_OPTIONS}
            caption={KIND_CAPTION}
            value={kind}
            onChange={onKindChange}
            disabled={isLoading}
          />
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
      confirmLabel="Unsubscribe from Extension"
      intent="destructive"
      confirmIcon={<ExtensionIcon />}
    />
  );
}
