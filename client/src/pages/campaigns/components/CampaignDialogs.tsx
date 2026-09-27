import {
  AnimatedAlert,
  ConfirmDialog,
  CreateDialog,
  EditDialog,
} from "@/client/src/components/common/index.ts";
import { useDebouncedValue } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import {
  AdminPanelSettings as GMIcon,
  Edit as EditIcon,
  ExitToApp as LeaveIcon,
  Person as PersonIcon,
  PersonAdd as PersonAddIcon,
  PersonRemove as PersonRemoveIcon,
  Send as SendIcon,
} from "@mui/icons-material";
import {
  Alert,
  Autocomplete,
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { useState } from "react";
import { Controller, type UseFormReturn } from "react-hook-form";
import { createListboxScrollHandler } from "@/client/src/lib/listboxScroll.ts";

export type CreateCampaignFormData = InferRequestType<
  (typeof rpc.api.campaigns)["$post"]
>["json"];

export type EditCampaignFormData = InferRequestType<
  (typeof rpc.api.campaigns)[":id"]["$put"]
>["json"];

export type AddPlayerFormData = InferRequestType<
  (typeof rpc.api.campaigns)[":id"]["players"]["$post"]
>["json"];

export type EditPlayerFormData = InferRequestType<
  (typeof rpc.api.campaigns)[":id"]["players"][":playerId"]["$put"]
>["json"];

export type CampaignPlayer = InferResponseType<
  (typeof rpc.api.campaigns)[":id"]["players"]["$get"],
  200
>["items"][number];

interface CreateCampaignDialogProps {
  open: boolean;
  onClose: () => void;
  form: UseFormReturn<CreateCampaignFormData>;
  onSubmit: (data: CreateCampaignFormData) => void;
  isLoading: boolean;
}

export function CreateCampaignDialog({
  open,
  onClose,
  form,
  onSubmit,
  isLoading,
}: CreateCampaignDialogProps) {
  const [rulesetSearch, setRulesetSearch] = useState("");
  const debouncedRulesetSearch = useDebouncedValue(rulesetSearch);

  form.register("rulesetId", { required: "Ruleset is required" });

  const {
    data: rulesetsData,
    isLoading: rulesetsLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.rulesets.list({ scope: "published", search: debouncedRulesetSearch }),
    queryFn: async ({ pageParam }) => {
      return parseResponse(rpc.api.rulesets.$get({
        query: {
          limit: "10",
          page: pageParam.toString(),
          scope: "published",
          ...(debouncedRulesetSearch && { search: debouncedRulesetSearch }),
        },
      }));
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: open,
  });

  const rulesets = (rulesetsData?.pages.flatMap((page) => page.items) ?? [])
    .map((r) => ({ ...r, group: r.status === "Draft" ? "My Drafts" as const : "Published" as const }))
    .sort((a, b) => (a.group === b.group ? 0 : a.group === "My Drafts" ? -1 : 1));
  const [selectedRuleset, setSelectedRuleset] = useState<(typeof rulesets)[number] | null>(null);

  const handleRulesetsScroll = createListboxScrollHandler({ hasNextPage, isFetchingNextPage, fetchNextPage });

  return (
    <CreateDialog
      open={open}
      onClose={onClose}
      title="Create New Campaign"
      form={form}
      onSubmit={onSubmit}
      isLoading={isLoading}
    >
      <AnimatedAlert in={selectedRuleset !== null && !selectedRuleset.userId} severity="warning" sx={{ mb: 2 }}>
        Base rulesets are read-only templates. Fork it first to customize rules for your group.
      </AnimatedAlert>
      <TextField
        {...form.register("name", { required: "Name is required" })}
        label="Name"
        fullWidth
        error={!!form.formState.errors.name}
        helperText={form.formState.errors.name?.message}
        autoFocus
        disabled={isLoading}
      />
      <Autocomplete
        options={rulesets}
        getOptionLabel={(option) => option.name}
        groupBy={(option) => option.group}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        value={selectedRuleset}
        onChange={(_, newValue) => {
          setSelectedRuleset(newValue);
          form.setValue("rulesetId", newValue?.id ?? "");
        }}
        onInputChange={(_, value, reason) => {
          if (reason === "input") setRulesetSearch(value);
        }}
        filterOptions={(x) => x}
        loading={rulesetsLoading}
        disabled={isLoading}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Ruleset"
            error={!!form.formState.errors.rulesetId}
            helperText={form.formState.errors.rulesetId?.message}
          />
        )}
        fullWidth
        slotProps={{
          listbox: {
            onScroll: handleRulesetsScroll,
            style: { maxHeight: 300 },
          }
        }}
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
    </CreateDialog>
  );
}

interface EditCampaignDialogProps {
  open: boolean;
  onClose: () => void;
  form: UseFormReturn<EditCampaignFormData>;
  onSubmit: (data: EditCampaignFormData) => void;
  isLoading: boolean;
}

export function EditCampaignDialog({
  open,
  onClose,
  form,
  onSubmit,
  isLoading,
}: EditCampaignDialogProps) {
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
    </EditDialog>
  );
}

interface PlayerFieldProps {
  form: UseFormReturn<AddPlayerFormData | EditPlayerFormData>;
  isLoading: boolean;
}

function PlayerEmailField({ form, isLoading }: PlayerFieldProps) {
  return (
    <TextField
      {...form.register("email")}
      label="Email address"
      placeholder="Enter an email to send an invite..."
      type="email"
      fullWidth
      disabled={isLoading}
    />
  );
}

function PlayerRoleSelect({ form, isLoading }: PlayerFieldProps) {
  return (
    <Controller
      name="role"
      control={form.control}
      render={({ field }) => (
        <FormControl fullWidth disabled={isLoading}>
          <InputLabel>Role</InputLabel>
          <Select {...field} label="Role">
            <MenuItem value="Player Character">
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <PersonIcon sx={{ fontSize: 20 }} />
                Player Character
              </Box>
            </MenuItem>
            <MenuItem value="Game Master">
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <GMIcon sx={{ fontSize: 20 }} />
                Game Master
              </Box>
            </MenuItem>
          </Select>
        </FormControl>
      )}
    />
  );
}

interface AddPlayerDialogProps {
  open: boolean;
  onClose: () => void;
  form: UseFormReturn<AddPlayerFormData>;
  onSubmit: (data: AddPlayerFormData) => void;
  isLoading: boolean;
}

export function AddPlayerDialog({
  open,
  onClose,
  form,
  onSubmit,
  isLoading,
}: AddPlayerDialogProps) {
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

interface EditPlayerDialogProps {
  open: boolean;
  onClose: () => void;
  form: UseFormReturn<EditPlayerFormData>;
  onSubmit: (data: EditPlayerFormData) => void;
  isLoading: boolean;
  selectedPlayer?: CampaignPlayer | null;
}

export function EditPlayerDialog({
  open,
  onClose,
  form,
  onSubmit,
  isLoading,
  selectedPlayer,
}: EditPlayerDialogProps) {
  const pendingInvite = selectedPlayer?.invitesInCampaigns?.[0];
  const hasPendingInvite = pendingInvite?.status === "Pending";
  const isAssigned = !!selectedPlayer?.usersInAccount;
  const pendingInviteEmail = pendingInvite?.usersInAccount?.emailAddress ?? pendingInvite?.email;
  const inviting = !!form.watch("email");

  return (
    <EditDialog
      open={open}
      onClose={onClose}
      title="Edit Player"
      form={form}
      onSubmit={onSubmit}
      isLoading={isLoading}
      submitLabel={hasPendingInvite ? "Update Role" : inviting ? "Send Invite" : "Update Player"}
      submitIcon={inviting ? <SendIcon /> : <EditIcon />}
    >
      {isAssigned
        ? (
          <Alert severity="info">
            <Typography variant="body2">
              This player slot is assigned to an active user.
            </Typography>
          </Alert>
        )
        : hasPendingInvite
        ? (
          <Alert severity="warning">
            <Typography variant="body2">
              This player slot has a pending invite sent on{" "}
              {new Date(pendingInvite.createdAt).toLocaleDateString()}.
            </Typography>
          </Alert>
        )
        : (
          <Alert severity="warning">
            <Typography variant="body2">
              This player slot is not linked to any user. Enter an email address to send an
              invite.
            </Typography>
          </Alert>
        )}

      {hasPendingInvite
        ? (
          <TextField
            label="Invited email"
            fullWidth
            value={pendingInviteEmail ?? ""}
            disabled
            slotProps={{
              input: {
                readOnly: true,
              },
            }}
          />
        )
        : !isAssigned && <PlayerEmailField form={form} isLoading={isLoading} />}

      <PlayerRoleSelect form={form} isLoading={isLoading} />
    </EditDialog>
  );
}

interface RemovePlayerDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  isSelfRemoval?: boolean;
  selectedPlayer?: CampaignPlayer | null;
}

export function RemovePlayerDialog({
  open,
  onClose,
  onConfirm,
  isLoading,
  isSelfRemoval = false,
  selectedPlayer,
}: RemovePlayerDialogProps) {
  const pendingInvite = selectedPlayer?.invitesInCampaigns?.[0];
  const hasPendingInvite = pendingInvite?.status === "Pending";
  const isAssigned = !!selectedPlayer?.usersInAccount;

  const getPlayerName = () => {
    if (isAssigned) {
      return selectedPlayer.usersInAccount!.username ?? selectedPlayer.usersInAccount!.emailAddress;
    }
    if (hasPendingInvite) {
      return pendingInvite.usersInAccount?.username ?? pendingInvite.usersInAccount?.emailAddress ??
        pendingInvite.email ?? "invited user";
    }
    return "this player";
  };

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      isLoading={isLoading}
      title={isSelfRemoval ? "Leave Campaign" : "Remove Player"}
      message={isSelfRemoval ? (
        "Are you sure you want to leave this campaign? You will lose access unless re-invited."
      ) : (
        <>
          Are you sure you want to remove <strong>{getPlayerName()}</strong> from this campaign?
          {hasPendingInvite && " This will also cancel any pending invitations."}{" "}
          This action cannot be undone.
        </>
      )}
      confirmLabel={isSelfRemoval ? "Leave" : "Remove Player"}
      confirmColor={isSelfRemoval ? "warning" : "error"}
      confirmIcon={isSelfRemoval ? <LeaveIcon /> : <PersonRemoveIcon />}
    />
  );
}
