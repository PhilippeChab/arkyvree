import { AnimatedAlert, CreateDialog, FormDialog, Modal, DiceSpinner } from "@/client/src/components/common/index.ts";
import { useDebouncedValue } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import {
  AdminPanelSettings as GMIcon,
  Archive as ArchiveIcon,
  Edit as EditIcon,
  ExitToApp as LeaveIcon,
  Person as PersonIcon,
  PersonAdd as PersonAddIcon,
  Send as SendIcon,
} from "@mui/icons-material";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";

export type CreateCampaignFormData = InferRequestType<
  (typeof rpc.api.campaigns)["$post"]
>["json"];

export type EditCampaignFormData = InferRequestType<
  (typeof rpc.api.campaigns)[":id"]["$put"]
>["json"];

export type AddPlayerFormData = {
  role: "Game Master" | "Player Character";
  email?: string;
};

export type EditPlayerFormData = {
  role: "Game Master" | "Player Character";
  email?: string;
};

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
      const response = await rpc.api.rulesets.$get({
        query: {
          limit: "10",
          page: pageParam.toString(),
          scope: "published",
          ...(debouncedRulesetSearch && { search: debouncedRulesetSearch }),
        },
      });
      if (!response.ok) throw new Error("Failed to fetch rulesets");
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: open,
  });

  const rulesets = (rulesetsData?.pages.flatMap((page) => page.items) ?? [])
    .map((r) => ({ ...r, group: r.status === "Draft" ? "My Drafts" as const : "Published" as const }))
    .sort((a, b) => (a.group === b.group ? 0 : a.group === "My Drafts" ? -1 : 1));
  const [selectedRuleset, setSelectedRuleset] = useState<(typeof rulesets)[number] | null>(null);

  const handleRulesetsScroll = (event: React.UIEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const bottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
    if (bottom && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  return (
    <CreateDialog
      open={open}
      onClose={onClose}
      title={
        <Typography component="div" sx={{ fontWeight: 600, typography: { xs: "h6", sm: "h5" } }}>
          Create New Campaign
        </Typography>
      }
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
    <FormDialog
      open={open}
      onClose={onClose}
      form={form}
      isLoading={isLoading}
    >
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <DialogTitle>
          <Typography component="div" sx={{ fontWeight: 600, typography: { xs: "h6", sm: "h5" } }}>
            Edit Campaign
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

interface DeleteCampaignDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}

export function DeleteCampaignDialog({
  open,
  onClose,
  onConfirm,
  isLoading,
}: DeleteCampaignDialogProps) {
  return (
    <Modal open={open} onClose={() => !isLoading && onClose()}>
      <DialogTitle>
        <Typography component="div" sx={{ fontWeight: 600, typography: { xs: "h6", sm: "h5" } }}>
          Archive Campaign
        </Typography>
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          Are you sure you want to archive this campaign? You can restore it later from the archived
          campaigns section.
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
          <DiceSpinner size="small" loading={isLoading}>Archive Campaign</DiceSpinner>
        </Button>
      </DialogActions>
    </Modal>
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
  const handleSubmit = (data: AddPlayerFormData) => {
    onSubmit({
      ...data,
      email: data.email || undefined,
    });
  };

  const handleClose = () => {
    form.reset();
    onClose();
  };

  const emailValue = form.watch("email") ?? "";

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      form={form}
      isLoading={isLoading}
    >
      <form onSubmit={form.handleSubmit(handleSubmit)}>
        <DialogTitle>
          <Typography component="div" sx={{ fontWeight: 600, typography: { xs: "h6", sm: "h5" } }}>
            Add Player
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <Alert severity="info">
              <Typography variant="body2">
                You can either create an empty player slot or enter an email address to send an
                invite.
              </Typography>
            </Alert>

            <TextField
              {...form.register("email")}
              label="Email address"
              placeholder="Enter an email to send an invite..."
              type="email"
              fullWidth
              disabled={isLoading}
            />

            <FormControl fullWidth disabled={isLoading}>
              <InputLabel>Role</InputLabel>
              <Select
                {...form.register("role", { required: "Role is required" })}
                value={form.watch("role") ?? "Player Character"}
                onChange={(e) =>
                  form.setValue("role", e.target.value as "Game Master" | "Player Character")}
                label="Role"
                error={!!form.formState.errors.role}
              >
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
              {form.formState.errors.role && (
                <FormHelperText error>
                  {form.formState.errors.role.message}
                </FormHelperText>
              )}
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleClose} disabled={isLoading} variant="outlined" color="inherit">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isLoading}
            startIcon={emailValue ? <SendIcon /> : <PersonAddIcon />}
          >
            <DiceSpinner size="small" loading={isLoading}>
              {emailValue ? "Send Invite" : "Create Player"}
            </DiceSpinner>
          </Button>
        </DialogActions>
      </form>
    </FormDialog>
  );
}

interface EditPlayerDialogProps {
  open: boolean;
  onClose: () => void;
  form: UseFormReturn<EditPlayerFormData>;
  onSubmit: (data: EditPlayerFormData) => void;
  isLoading: boolean;
  selectedPlayer?: {
    id: string;
    role: "Game Master" | "Player Character";
    usersInAccount?: {
      id: string;
      username?: string | null;
      emailAddress: string;
    } | null;
    invitesInCampaigns?: Array<{
      id: string;
      userId: string | null;
      email: string | null;
      status: string;
      createdAt: string;
      updatedAt: string;
      usersInAccount?: {
        id: string;
        username?: string | null;
        emailAddress: string;
      } | null;
    }>;
  } | null;
}

export function EditPlayerDialog({
  open,
  onClose,
  form,
  onSubmit,
  isLoading,
  selectedPlayer,
}: EditPlayerDialogProps) {
  // Check if there's a pending invite
  const pendingInvite = selectedPlayer?.invitesInCampaigns?.[0];
  const hasPendingInvite = pendingInvite?.status === "Pending";
  const isAssigned = !!selectedPlayer?.usersInAccount;

  const pendingInviteEmail = pendingInvite?.usersInAccount?.emailAddress ?? pendingInvite?.email;

  const emailValue = form.watch("email") ?? "";

  const handleSubmit = (data: EditPlayerFormData) => {
    onSubmit({
      ...data,
      email: data.email || undefined,
    });
  };

  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      form={form}
      isLoading={isLoading}
    >
      <form onSubmit={form.handleSubmit(handleSubmit)}>
        <DialogTitle>
          <Typography component="div" sx={{ fontWeight: 600, typography: { xs: "h6", sm: "h5" } }}>
            Edit Player
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
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
              : !isAssigned && (
                <TextField
                  {...form.register("email")}
                  label="Email address"
                  placeholder="Enter an email to send an invite..."
                  type="email"
                  fullWidth
                  disabled={isLoading}
                />
              )}

            <FormControl fullWidth disabled={isLoading}>
              <InputLabel>Role</InputLabel>
              <Select
                {...form.register("role", { required: "Role is required" })}
                value={form.watch("role") ?? selectedPlayer?.role ?? "Player Character"}
                onChange={(e) =>
                  form.setValue("role", e.target.value as "Game Master" | "Player Character")}
                label="Role"
                error={!!form.formState.errors.role}
              >
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
              {form.formState.errors.role && (
                <FormHelperText error>
                  {form.formState.errors.role.message}
                </FormHelperText>
              )}
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleClose} disabled={isLoading} variant="outlined" color="inherit">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isLoading}
            startIcon={emailValue ? <SendIcon /> : <EditIcon />}
          >
            <DiceSpinner size="small" loading={isLoading}>
              {hasPendingInvite
                ? "Update Role"
                : (emailValue ? "Send Invite" : "Update Player")}
            </DiceSpinner>
          </Button>
        </DialogActions>
      </form>
    </FormDialog>
  );
}

interface RemovePlayerDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  isSelfRemoval?: boolean;
  selectedPlayer?: {
    id: string;
    role: "Game Master" | "Player Character";
    usersInAccount?: {
      id: string;
      username?: string | null;
      emailAddress: string;
    } | null;
    invitesInCampaigns?: Array<{
      id: string;
      userId: string | null;
      email: string | null;
      status: string;
      createdAt: string;
      updatedAt: string;
      usersInAccount?: {
        id: string;
        username?: string | null;
        emailAddress: string;
      } | null;
    }>;
  } | null;
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
    <Modal open={open} onClose={() => !isLoading && onClose()}>
      <DialogTitle>
        <Typography component="div" sx={{ fontWeight: 600, typography: { xs: "h6", sm: "h5" } }}>
          {isSelfRemoval ? "Leave Campaign" : "Remove Player"}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          {isSelfRemoval ? (
            <>Are you sure you want to leave this campaign? You will lose access unless re-invited.</>
          ) : (
            <>
              Are you sure you want to remove <strong>{getPlayerName()}</strong> from this campaign?
              {hasPendingInvite && " This will also cancel any pending invitations."}{" "}
              This action cannot be undone.
            </>
          )}
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={isLoading} variant="outlined" color="inherit">
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          color={isSelfRemoval ? "warning" : "error"}
          variant="contained"
          disabled={isLoading}
          startIcon={isSelfRemoval ? <LeaveIcon /> : <ArchiveIcon />}
        >
          <DiceSpinner size="small" loading={isLoading}>
            {isSelfRemoval ? "Leave" : "Remove Player"}
          </DiceSpinner>
        </Button>
      </DialogActions>
    </Modal>
  );
}
