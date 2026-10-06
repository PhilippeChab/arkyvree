import {
  Edit as EditIcon,
  AdminPanelSettings as GMIcon,
  ExitToApp as LeaveIcon,
  PersonAdd as PersonAddIcon,
  Person as PersonIcon,
  PersonRemove as PersonRemoveIcon,
  Send as SendIcon,
} from "@mui/icons-material";
import { Alert, Box, TextField, Typography } from "@mui/material";
import type { InferRequestType } from "hono/client";
import { type ElementType, useState } from "react";
import { Controller, type UseFormReturn } from "react-hook-form";

import {
  BaseRulesetAlert,
  ConfirmDialog,
  CreateDialog,
  DescriptionField,
  EditDialog,
  FormTextField,
  NameField,
  RulesetPicker,
  SelectField,
} from "@/client/src/components/common/index.ts";
import { useDebouncedValue, useListboxQuery } from "@/client/src/hooks/index.ts";
import { formatDate } from "@/client/src/lib/activityFormatters.ts";
import { rulesetPickerQuery } from "@/client/src/lib/queries.ts";
import { nameRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

import type { PlayerFormData, PlayerSlot } from "./players.ts";

interface CreateCampaignDialogProps {
  open: boolean;
  onClose: () => void;
  form: UseFormReturn<CreateCampaignFormData>;
  onSubmit: (data: CreateCampaignFormData) => void;
  isLoading: boolean;
}

interface EditCampaignDialogProps {
  open: boolean;
  onClose: () => void;
  form: UseFormReturn<EditCampaignFormData>;
  onSubmit: (data: EditCampaignFormData) => void;
  isLoading: boolean;
}

interface PlayerFieldProps {
  form: UseFormReturn<PlayerFormData>;
  isLoading: boolean;
}

interface AddPlayerDialogProps {
  open: boolean;
  onClose: () => void;
  form: UseFormReturn<PlayerFormData>;
  onSubmit: (data: PlayerFormData) => void;
  isLoading: boolean;
}

interface EditPlayerDialogProps {
  open: boolean;
  onClose: () => void;
  form: UseFormReturn<PlayerFormData>;
  onSubmit: (data: PlayerFormData) => void;
  isLoading: boolean;
  /** The slot being edited, from `getPlayerSlot`. */
  slot: PlayerSlot | null;
}

interface RemovePlayerDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  isSelfRemoval?: boolean;
  /** The slot being removed, from `getPlayerSlot`. */
  slot: PlayerSlot | null;
}

export type CreateCampaignFormData = InferRequestType<(typeof rpc.api.campaigns)["$post"]>["json"];

export type EditCampaignFormData = InferRequestType<(typeof rpc.api.campaigns)[":id"]["$put"]>["json"];

function PlayerEmailField({ form, isLoading }: PlayerFieldProps) {
  return (
    <FormTextField
      control={form.control}
      name="email"
      label="Email address"
      placeholder="Enter an email to send an invite..."
      type="email"
      fullWidth
      disabled={isLoading}
    />
  );
}

function RoleLabel({ icon: Icon, label }: { icon: ElementType; label: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <Icon sx={{ fontSize: 20 }} />
      {label}
    </Box>
  );
}

function PlayerRoleSelect({ form, isLoading }: PlayerFieldProps) {
  return (
    <SelectField
      control={form.control}
      name="role"
      label="Role"
      rules={{ required: "Role is required" }}
      disabled={isLoading}
      options={[
        { value: "Player Character", label: <RoleLabel icon={PersonIcon} label="Player Character" /> },
        { value: "Game Master", label: <RoleLabel icon={GMIcon} label="Game Master" /> },
      ]}
    />
  );
}

export function AddPlayerDialog({ open, onClose, form, onSubmit, isLoading }: AddPlayerDialogProps) {
  const inviting = !!form.watch("email");

  return (
    <CreateDialog
      open={open}
      onClose={onClose}
      title="Add Player"
      form={form}
      onSubmit={onSubmit}
      isLoading={isLoading}
      submitLabel={inviting ? "Send Invite" : "Create Player"}
      submitIcon={inviting ? <SendIcon /> : <PersonAddIcon />}
    >
      <Alert severity="info">
        <Typography variant="body2">
          You can either create an empty player slot or enter an email address to send an invite.
        </Typography>
      </Alert>
      <PlayerEmailField form={form} isLoading={isLoading} />
      <PlayerRoleSelect form={form} isLoading={isLoading} />
    </CreateDialog>
  );
}

export function CreateCampaignDialog({ open, onClose, form, onSubmit, isLoading }: CreateCampaignDialogProps) {
  const [rulesetSearch, setRulesetSearch] = useState("");
  const debouncedRulesetSearch = useDebouncedValue(rulesetSearch);

  const {
    items: publishedRulesets,
    isLoading: rulesetsLoading,
    onScroll: handleRulesetsScroll,
  } = useListboxQuery({
    ...rulesetPickerQuery("published", debouncedRulesetSearch),
    enabled: open,
  });

  const rulesets = publishedRulesets
    .map((r) => ({ ...r, group: r.status === "Draft" ? ("My Drafts" as const) : ("Published" as const) }))
    .sort((a, b) => (a.group === b.group ? 0 : a.group === "My Drafts" ? -1 : 1));
  const [selectedRuleset, setSelectedRuleset] = useState<(typeof rulesets)[number] | null>(null);

  return (
    <CreateDialog
      open={open}
      onClose={onClose}
      title="Create New Campaign"
      form={form}
      onSubmit={onSubmit}
      isLoading={isLoading}
    >
      <BaseRulesetAlert ruleset={selectedRuleset} />
      <NameField control={form.control} name="name" rules={nameRules} autoFocus disabled={isLoading} />
      <Controller
        name="rulesetId"
        control={form.control}
        rules={{ required: "Ruleset is required" }}
        render={({ field, fieldState }) => (
          <RulesetPicker
            rulesets={rulesets}
            value={selectedRuleset}
            onChange={(ruleset) => {
              setSelectedRuleset(ruleset);
              field.onChange(ruleset?.id ?? "");
            }}
            onSearch={setRulesetSearch}
            onScroll={handleRulesetsScroll}
            loading={rulesetsLoading}
            disabled={isLoading}
            error={fieldState.error}
            inputRef={field.ref}
          />
        )}
      />
      <DescriptionField control={form.control} name="description" disabled={isLoading} rows={4} />
    </CreateDialog>
  );
}

export function EditCampaignDialog({ open, onClose, form, onSubmit, isLoading }: EditCampaignDialogProps) {
  return (
    <EditDialog
      open={open}
      onClose={onClose}
      title="Edit Campaign"
      form={form}
      onSubmit={onSubmit}
      isLoading={isLoading}
      submitLabel="Save Changes"
    >
      <NameField control={form.control} name="name" rules={nameRules} autoFocus disabled={isLoading} />
      <DescriptionField control={form.control} name="description" disabled={isLoading} rows={4} />
    </EditDialog>
  );
}

export function EditPlayerDialog({ open, onClose, form, onSubmit, isLoading, slot }: EditPlayerDialogProps) {
  const pendingInvite = slot?.pendingInvite;
  const inviting = !!form.watch("email");

  return (
    <EditDialog
      open={open}
      onClose={onClose}
      title="Edit Player"
      form={form}
      onSubmit={onSubmit}
      isLoading={isLoading}
      submitLabel={pendingInvite ? "Update Role" : inviting ? "Send Invite" : "Update Player"}
      submitIcon={inviting ? <SendIcon /> : <EditIcon />}
    >
      {slot?.state === "assigned" ? (
        <Alert severity="info">
          <Typography variant="body2">This player slot is assigned to an active user.</Typography>
        </Alert>
      ) : pendingInvite ? (
        <Alert severity="warning">
          <Typography variant="body2">
            This player slot has a pending invite sent on {formatDate(pendingInvite.createdAt)}.
          </Typography>
        </Alert>
      ) : (
        <Alert severity="warning">
          <Typography variant="body2">
            This player slot is not linked to any user. Enter an email address to send an invite.
          </Typography>
        </Alert>
      )}

      {pendingInvite ? (
        <TextField
          label="Invited email"
          fullWidth
          value={pendingInvite.usersInAccount?.emailAddress ?? pendingInvite.email ?? ""}
          disabled
          slotProps={{
            input: {
              readOnly: true,
            },
          }}
        />
      ) : (
        slot?.state === "unassigned" && <PlayerEmailField form={form} isLoading={isLoading} />
      )}

      <PlayerRoleSelect form={form} isLoading={isLoading} />
    </EditDialog>
  );
}

export function RemovePlayerDialog({
  open,
  onClose,
  onConfirm,
  isLoading,
  isSelfRemoval = false,
  slot,
}: RemovePlayerDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      isLoading={isLoading}
      title={isSelfRemoval ? "Leave Campaign" : "Remove Player"}
      message={
        isSelfRemoval ? (
          "Are you sure you want to leave this campaign? You will lose access unless re-invited."
        ) : (
          <>
            Are you sure you want to remove <strong>{slot?.name}</strong> from this campaign?
            {slot?.pendingInvite && " This will also cancel any pending invitations."} This action cannot be undone.
          </>
        )
      }
      confirmLabel={isSelfRemoval ? "Leave" : "Remove Player"}
      confirmColor={isSelfRemoval ? "warning" : "error"}
      confirmIcon={isSelfRemoval ? <LeaveIcon /> : <PersonRemoveIcon />}
    />
  );
}
