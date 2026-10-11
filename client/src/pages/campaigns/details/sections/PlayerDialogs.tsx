import { Alert, DialogContentText, Stack, TextField, Typography } from "@mui/material";
import { type ElementType } from "react";
import { type UseFormReturn } from "react-hook-form";

import {
  ConfirmDialog,
  CreateDialog,
  EditDialog,
  EmailField,
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
import { requiredRules } from "@/client/src/lib/validation.ts";

import type { PlayerFormData, PlayerSlot } from "./players.ts";

interface AddPlayerDialogProps {
  form: UseFormReturn<PlayerFormData>;
  onClose: () => void;
  onSubmit: (data: PlayerFormData) => void;
  open: boolean;
  pending: boolean;
}

interface EditPlayerDialogProps {
  form: UseFormReturn<PlayerFormData>;
  onClose: () => void;
  onSubmit: (data: PlayerFormData) => void;
  open: boolean;
  pending: boolean;
  /** The slot being edited, from `getPlayerSlot`. */
  slot: PlayerSlot | null;
}

interface PlayerFieldProps {
  form: UseFormReturn<PlayerFormData>;
  pending: boolean;
}

interface RemovePlayerDialogProps {
  /** The player leaves the campaign, rather than its Game Master removing them. */
  isSelfRemoval: boolean;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  pending: boolean;
  /** The slot being removed, from `getPlayerSlot`. */
  slot: PlayerSlot | null;
}

interface RoleLabelProps {
  icon: ElementType;
  label: string;
}

function PlayerEmailField({ form, pending }: PlayerFieldProps) {
  return (
    <EmailField
      control={form.control}
      name="email"
      optional
      placeholder="Enter an email to send an invite…"
      disabled={pending}
    />
  );
}

function PlayerRoleSelect({ form, pending }: PlayerFieldProps) {
  return (
    <SelectField
      control={form.control}
      name="role"
      label="Role"
      rules={requiredRules("Role is required")}
      disabled={pending}
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

export function AddPlayerDialog({ open, onClose, form, onSubmit, pending }: AddPlayerDialogProps) {
  const inviting = !!form.watch("email");

  return (
    <CreateDialog
      open={open}
      onClose={onClose}
      title="Add Player"
      form={form}
      onSubmit={onSubmit}
      pending={pending}
      submitLabel={inviting ? "Send Invite" : "Add Player"}
      submitIcon={inviting ? <SendIcon /> : <PersonAddIcon />}
    >
      <DialogContentText>
        You can either create an empty player slot or enter an email address to send an invite.
      </DialogContentText>
      <PlayerEmailField form={form} pending={pending} />
      <PlayerRoleSelect form={form} pending={pending} />
    </CreateDialog>
  );
}

export function EditPlayerDialog({ open, onClose, form, onSubmit, pending, slot }: EditPlayerDialogProps) {
  const pendingInvite = slot?.pendingInvite;
  const inviting = !!form.watch("email");

  return (
    <EditDialog
      open={open}
      onClose={onClose}
      title="Edit Player"
      form={form}
      onSubmit={onSubmit}
      pending={pending}
      submitLabel={pendingInvite ? "Update Role" : inviting ? "Send Invite" : "Update Player"}
      submitIcon={inviting ? <SendIcon /> : <EditIcon />}
    >
      {slot?.state === "assigned" ? (
        <DialogContentText>This player slot is assigned to an active user.</DialogContentText>
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
          slotProps={{
            input: {
              readOnly: true,
            },
          }}
        />
      ) : (
        slot?.state === "unassigned" && <PlayerEmailField form={form} pending={pending} />
      )}

      <PlayerRoleSelect form={form} pending={pending} />
    </EditDialog>
  );
}

export function RemovePlayerDialog({
  open,
  onClose,
  onConfirm,
  pending,
  isSelfRemoval,
  slot,
}: RemovePlayerDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      pending={pending}
      title={isSelfRemoval ? "Leave Campaign" : "Remove Player"}
      message={
        isSelfRemoval ? (
          "Are you sure you want to leave this campaign? You will lose access unless you're invited again."
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
