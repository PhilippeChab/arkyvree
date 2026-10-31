import { Box, Stack, Typography } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { type ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  AddButton,
  BlankState,
  ConfirmDialog,
  DataCell,
  DataRow,
  DataTable,
  EMAIL_AS_NAME_SX,
  EmptyValue,
  ListPageResults,
  RoleChip,
  ROW_ACTIONS_HOVER_SX,
  RowAction,
  RowActions,
  SearchBar,
  SectionContent,
  StatusChip,
  type TableColumn,
  TableSkeleton,
  USERNAME_BESIDE_EMAIL_SX,
} from "@/client/src/components/common/index.ts";
import {
  CharacterIcon,
  DeleteIcon,
  EditIcon,
  LeaveIcon,
  PendingIcon,
  PlayersIcon,
  RevokeIcon,
  UnassignedIcon,
} from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDialogState, useFormWith, useListPageQuery, useSearchText } from "@/client/src/hooks/index.ts";
import { formatDate } from "@/client/src/lib/formatDate.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { type CampaignDetail } from "@/client/src/pages/campaigns/campaignQueries.ts";
import {
  campaignPlayersQuery,
  invalidateCampaignPlayers,
} from "@/client/src/pages/campaigns/details/sectionQueries.ts";
import { useCampaignPermissions } from "@/client/src/pages/campaigns/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

import { AddPlayerDialog, EditPlayerDialog, RemovePlayerDialog } from "./PlayerDialogs.tsx";
import {
  type CampaignPlayer,
  getPlayerSlot,
  playerDisplay,
  type PlayerFormData,
  type PlayerState,
  ROLE_ICONS,
  toPlayerPayload,
} from "./players.ts";

interface PlayersSectionProps {
  campaign: CampaignDetail;
}

/** An empty slot's caption under its name ("No player assigned"), which a phone leaves out */
const CAPTION_SX = { color: "text.secondary", display: { xs: "none", sm: "inline" } };

/** The players table's columns: its header, and its first load's */
const PLAYER_COLUMNS: TableColumn[] = [
  { key: "player", label: "Player", width: "20%" },
  { key: "role", label: "Role", width: "20%" },
  { key: "status", label: "Status", width: "20%" },
  { key: "joined", label: "Joined", width: "20%" },
  { align: "right", key: "actions", label: "Actions", width: "10%" },
];

const STATUS_CHIPS = {
  assigned: { icon: <CharacterIcon sx={{ fontSize: 14 }} />, label: "Active", color: "success" },
  pending: { icon: <PendingIcon sx={{ fontSize: 14 }} />, label: "Invite Pending", color: "warning" },
  unassigned: { icon: <UnassignedIcon sx={{ fontSize: 14 }} />, label: "Unassigned", color: "default" },
} as const satisfies Record<PlayerState, { color: "default" | "success" | "warning"; icon: ReactNode; label: string }>;

export function PlayersSection({ campaign }: PlayersSectionProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  // A player's or an invite's dialogs keep it while they fade out
  const editDialog = useDialogState<CampaignPlayer>();
  const removeDialog = useDialogState<CampaignPlayer>();
  const revokeDialog = useDialogState<string>();

  // Search state with debounce
  const { search: searchQuery, searchBarProps: searchTextProps } = useSearchText("playerSearch");

  const { canLeave, canManagePlayers, canRevokeInvites } = useCampaignPermissions(campaign);
  const currentUserId = useAuthStore((s) => s.user?.id);

  const addForm = useFormWith<PlayerFormData>({
    role: "Player Character",
    email: "",
  });

  const editForm = useFormWith<PlayerFormData>({
    role: "Player Character",
    email: "",
  });

  const players = useListPageQuery(campaignPlayersQuery(campaign.id, searchQuery));

  const addMutation = useMutation({
    mutationFn: async (data: PlayerFormData) =>
      parseResponse(
        rpc.api.campaigns[":id"].players.$post({
          param: { id: campaign.id },
          json: toPlayerPayload(data),
        }),
      ),
    // An email sends its invite: the player joins once they accept it
    onSuccess: (_player, data) => {
      snackbar.success(data.email ? "Invite sent" : "Player added");
      invalidateCampaignPlayers(queryClient, campaign.id);
      setAddDialogOpen(false);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to add player");
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ playerId, data }: { data: PlayerFormData; playerId: string }) =>
      parseResponse(
        rpc.api.campaigns[":id"].players[":playerId"].$put({
          param: { id: campaign.id, playerId },
          json: toPlayerPayload(data),
        }),
      ),
    onSuccess: (_player, { data }) => {
      snackbar.success(data.email ? "Invite sent" : "Player updated");
      invalidateCampaignPlayers(queryClient, campaign.id);
      editDialog.close();
    },
    onError: (error) => {
      snackbar.error(error, "Failed to update player");
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (playerId: string) =>
      parseResponse(
        rpc.api.campaigns[":id"].players[":playerId"].$delete({
          param: { id: campaign.id, playerId },
        }),
      ),
    onSuccess: () => {
      const removedSelf = removeDialog.target?.userId === currentUserId;
      snackbar.success(removedSelf ? "You left the campaign" : "Player removed");
      if (removedSelf) {
        navigate("/campaigns", { replace: true });
        // Back never renders it from the cache, as if they still played in it
        queryClient.removeQueries({ queryKey: QUERY_KEYS.campaigns.detail(campaign.id) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.campaigns.lists });
      } else {
        invalidateCampaignPlayers(queryClient, campaign.id, true);
        removeDialog.close();
      }
    },
    onError: (error) => {
      snackbar.error(error, "Failed to remove player");
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (inviteId: string) =>
      parseResponse(
        rpc.api.campaigns.invites[":inviteId"].revoke.$post({
          param: { inviteId },
        }),
      ),
    onSuccess: () => {
      snackbar.success("Invite revoked");
      invalidateCampaignPlayers(queryClient, campaign.id);
      revokeDialog.close();
    },
    onError: (error) => {
      snackbar.error(error, "Failed to revoke invite");
    },
  });

  const handleRevokeInvite = (inviteId: string) => revokeDialog.openWith(inviteId);

  const confirmRevokeInvite = () => {
    if (revokeDialog.target) revokeInviteMutation.mutate(revokeDialog.target);
  };

  const handleAddPlayer = () => {
    addForm.reset();
    setAddDialogOpen(true);
  };

  const confirmAddPlayer = (data: PlayerFormData) => {
    addMutation.mutate(data);
  };

  const handleEditPlayer = (player: CampaignPlayer) => {
    editForm.reset({
      role: player.role,
      email: "",
    });
    editDialog.openWith(player);
  };

  const confirmEditPlayer = (data: PlayerFormData) => {
    if (!editDialog.target) return;
    editMutation.mutate({ playerId: editDialog.target.id, data });
  };

  const handleRemovePlayer = (player: CampaignPlayer) => removeDialog.openWith(player);

  const confirmRemovePlayer = () => {
    if (!removeDialog.target) return;
    removeMutation.mutate(removeDialog.target.id);
  };

  return (
    <SectionContent>
      <Stack spacing={3}>
        <SearchBar
          {...searchTextProps}
          searchPlaceholder="Search players…"
          addLabel="Add Player"
          onAdd={canManagePlayers ? handleAddPlayer : undefined}
        />
        <ListPageResults
          variant="section"
          list={players}
          search={searchQuery}
          what="Players"
          skeleton={<TableSkeleton columns={PLAYER_COLUMNS} />}
          empty={
            <BlankState
              icon={PlayersIcon}
              title="No players in this campaign"
              description="Add players to start your adventure together"
              action={
                canManagePlayers ? (
                  <AddButton variant="outlined" size="large" label="Add Your First Player" onClick={handleAddPlayer} />
                ) : undefined
              }
            />
          }
        >
          <DataTable framed columns={PLAYER_COLUMNS} sx={{ width: "100%" }}>
            {players.items.map((player) => {
              const slot = getPlayerSlot(player);
              const displayInfo = playerDisplay(player, slot);
              // A player's or an invite's email address, which names the row alone on a phone
              const hasEmail = slot.state !== "unassigned" && !!displayInfo.caption;
              const statusChip = STATUS_CHIPS[slot.state];
              const isGameMaster = player.role === "Game Master";
              const RoleIcon = ROLE_ICONS[player.role];
              const isCurrentUser = player.userId === currentUserId;
              const canRevokeInvite = slot.state === "pending" && canRevokeInvites;
              // Its own seat the session leaves, another's the manager removes: but the last Game Master's, whom the
              // server neither demotes nor lets leave
              const canRemove = !player.isLastGameMaster && (isCurrentUser ? canLeave : canManagePlayers);
              const canEdit = !player.isLastGameMaster && canManagePlayers;
              const hasActions = canEdit || canRevokeInvite || canRemove;

              return (
                <DataRow
                  key={player.id}
                  sx={{
                    position: "relative",
                    ...ROW_ACTIONS_HOVER_SX,
                  }}
                >
                  <DataCell slot="primary">
                    <Box>
                      <Typography variant="body2" sx={hasEmail ? USERNAME_BESIDE_EMAIL_SX : { fontWeight: 500 }}>
                        {displayInfo.name}
                      </Typography>
                      <Typography variant="caption" sx={hasEmail ? EMAIL_AS_NAME_SX : CAPTION_SX}>
                        {displayInfo.caption}
                      </Typography>
                    </Box>
                  </DataCell>
                  <DataCell slot="inline">
                    <RoleChip
                      icon={<RoleIcon sx={{ fontSize: 14 }} />}
                      label={player.role}
                      color={isGameMaster ? "warning" : "primary"}
                    />
                  </DataCell>
                  <DataCell slot="inline">
                    <StatusChip icon={statusChip.icon} label={statusChip.label} color={statusChip.color} />
                  </DataCell>
                  <DataCell slot="hidden">
                    {player.joinedAt ? (
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        {formatDate(player.joinedAt)}
                      </Typography>
                    ) : (
                      <EmptyValue />
                    )}
                  </DataCell>
                  <DataCell slot={hasActions ? "trailing" : "hidden"} align="right">
                    {hasActions && (
                      <RowActions>
                        {canEdit && <RowAction icon={EditIcon} label="Edit" onClick={() => handleEditPlayer(player)} />}
                        {canRevokeInvite && (
                          <RowAction
                            icon={RevokeIcon}
                            label="Revoke Invite"
                            intent="caution"
                            onClick={() => handleRevokeInvite(slot.pendingInvite.id)}
                            disabled={revokeInviteMutation.isPending}
                          />
                        )}
                        {canRemove && (
                          <RowAction
                            icon={isCurrentUser ? LeaveIcon : DeleteIcon}
                            label={isCurrentUser ? "Leave" : "Remove"}
                            intent={isCurrentUser ? "caution" : "destructive"}
                            onClick={() => handleRemovePlayer(player)}
                          />
                        )}
                      </RowActions>
                    )}
                  </DataCell>
                </DataRow>
              );
            })}
          </DataTable>
        </ListPageResults>
      </Stack>
      <AddPlayerDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        form={addForm}
        onSubmit={confirmAddPlayer}
        pending={addMutation.isPending}
      />
      <EditPlayerDialog
        open={editDialog.open}
        onClose={editDialog.close}
        form={editForm}
        onSubmit={confirmEditPlayer}
        pending={editMutation.isPending}
        slot={editDialog.target && getPlayerSlot(editDialog.target)}
      />
      <RemovePlayerDialog
        open={removeDialog.open}
        onClose={removeDialog.close}
        onConfirm={confirmRemovePlayer}
        pending={removeMutation.isPending}
        isSelfRemoval={removeDialog.target?.userId === currentUserId}
        slot={removeDialog.target && getPlayerSlot(removeDialog.target)}
      />
      <ConfirmDialog
        open={revokeDialog.open}
        onClose={revokeDialog.close}
        title="Revoke Invite"
        message="Are you sure you want to revoke this invite? This action cannot be undone."
        onConfirm={confirmRevokeInvite}
        confirmLabel="Revoke Invite"
        intent="caution"
        pending={revokeInviteMutation.isPending}
      />
    </SectionContent>
  );
}
