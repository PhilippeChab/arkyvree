import { Alert, Stack, TextField, Typography } from "@mui/material";
import { type ElementType } from "react";
import { type UseFormReturn } from "react-hook-form";

import {
  ConfirmDialog,
  CreateDialog,
  EditDialog,
  FormTextField,
  SelectField,
} from "@/client/src/components/common/index.ts";
import {
  CharacterIcon,
  DeleteIcon,
  EditIcon,
  GMIcon,
  LeaveIcon,
  PersonAddIcon,
  SendIcon,
} from "@/client/src/components/icons/index.ts";
import { formatDate } from "@/client/src/lib/formatDate.ts";
import { OPTIONAL_EMAIL_RULES, requiredRules } from "@/client/src/lib/validation.ts";

import type { PlayerFormData, PlayerSlot } from "./players.ts";

interface AddPlayerDialogProps {
  form: UseFormReturn<PlayerFormData>;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (data: PlayerFormData) => void;
  open: boolean;
}

interface EditPlayerDialogProps {
  form: UseFormReturn<PlayerFormData>;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (data: PlayerFormData) => void;
  open: boolean;
  /** The slot being edited, from `getPlayerSlot`. */
  slot: PlayerSlot | null;
}

interface PlayerFieldProps {
  form: UseFormReturn<PlayerFormData>;
  isLoading: boolean;
}

interface RemovePlayerDialogProps {
  isLoading: boolean;
  isSelfRemoval?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  /** The slot being removed, from `getPlayerSlot`. */
  slot: PlayerSlot | null;
}

interface RoleLabelProps {
  icon: ElementType;
  label: string;
}

function PlayerEmailField({ form, isLoading }: PlayerFieldProps) {
  return (
    <FormTextField
      control={form.control}
      name="email"
      rules={OPTIONAL_EMAIL_RULES}
      label="Email Address"
      placeholder="Enter an email to send an invite…"
      type="email"
      fullWidth
      disabled={isLoading}
    />
  );
}

function PlayerRoleSelect({ form, isLoading }: PlayerFieldProps) {
  return (
    <SelectField
      control={form.control}
      name="role"
      label="Role"
      rules={requiredRules("Role is required")}
      disabled={isLoading}
      options={[
        { value: "Player Character", label: <RoleLabel icon={CharacterIcon} label="Player Character" /> },
        { value: "Game Master", label: <RoleLabel icon={GMIcon} label="Game Master" /> },
      ]}
    />
  );
}

function RoleLabel({ icon: Icon, label }: RoleLabelProps) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <Icon fontSize="small" />
      {label}
    </Stack>
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
          label="Invited Email"
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
            {slot?.pendingInvite && " This will also cancel its pending invite."} This action cannot be undone.
          </>
        )
      }
      confirmLabel={isSelfRemoval ? "Leave Campaign" : "Remove Player"}
      intent={isSelfRemoval ? "caution" : "destructive"}
      confirmIcon={isSelfRemoval ? <LeaveIcon /> : <DeleteIcon />}
    />
  );
}
