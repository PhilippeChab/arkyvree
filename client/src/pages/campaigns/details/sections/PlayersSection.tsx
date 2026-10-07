import { Box, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { type ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  AddButton,
  BlankState,
  ConfirmDialog,
  EmptyValue,
  LoadError,
  LoadMoreButton,
  NoMatchesState,
  RoleChip,
  ROW_ACTIONS_HOVER_SX,
  RowAction,
  RowActions,
  SearchBar,
  SectionContent,
  StatusChip,
  TableFrame,
  TableSkeleton,
} from "@/client/src/components/common/index.ts";
import {
  CharacterIcon,
  DeleteIcon,
  EditIcon,
  GMIcon,
  LeaveIcon,
  PendingIcon,
  PlayersIcon,
  RevokeIcon,
  UnassignedIcon,
} from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDialogState, useFormWith, useSearchText } from "@/client/src/hooks/index.ts";
import { formatDate } from "@/client/src/lib/formatDate.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import type { CampaignDetail } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
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
  toPlayerPayload,
} from "./players.ts";

interface PlayersSectionProps {
  campaign: CampaignDetail;
}

/** The players table's columns: its header, and its first load's */
const PLAYER_COLUMNS = [
  { key: "player", label: "Player", width: "20%" },
  { key: "role", label: "Role", width: "20%" },
  { key: "status", label: "Status", width: "20%" },
  { key: "joined", label: "Joined", width: "20%" },
  { align: "right" as const, key: "actions", label: "Actions", width: "10%" },
];

const STATUS_CHIPS = {
  assigned: null,
  pending: { icon: <PendingIcon sx={{ fontSize: 14 }} />, label: "Invite Pending", color: "warning" },
  unassigned: { icon: <UnassignedIcon sx={{ fontSize: 14 }} />, label: "Unassigned", color: "default" },
} as const satisfies Record<PlayerState, { color: "warning" | "default"; icon: ReactNode; label: string } | null>;

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

  const { canManagePlayers, canManageInvites } = useCampaignPermissions(campaign);
  const currentUserId = useAuthStore((s) => s.user?.id);

  const addForm = useFormWith<PlayerFormData>({
    role: "Player Character",
    email: "",
  });

  const editForm = useFormWith<PlayerFormData>({
    role: "Player Character",
    email: "",
  });

  const {
    data,
    isLoading: playersLoading,
    error: playersError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({ ...campaignPlayersQuery(campaign.id, searchQuery), placeholderData: keepPreviousData });

  const players = pageItems(data);
  const playersLoadFailed = !!playersError && !data;

  const addMutation = useMutation({
    mutationFn: async (data: PlayerFormData) =>
      parseResponse(
        rpc.api.campaigns[":id"].players.$post({
          param: { id: campaign.id },
          json: toPlayerPayload(data),
        }),
      ),
    onSuccess: () => {
      snackbar.success("Player added");
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
    onSuccess: () => {
      snackbar.success("Player updated");
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
      snackbar.success("Invitation revoked");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.campaigns.section(campaign.id, "players") });
      revokeDialog.close();
    },
    onError: (error) => {
      snackbar.error(error, "Failed to revoke invitation");
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
          actions={
            canManagePlayers && !campaign.deletedAt && <AddButton label="Add Player" onClick={handleAddPlayer} />
          }
        />
        {/* Loading State */}
        {playersLoading && <TableSkeleton columns={PLAYER_COLUMNS} />}
        {/* Error State: only while nothing has loaded, a failed refetch keeping the table */}
        {playersLoadFailed && (
          // The room below the error, at the end of the tab
          <Box sx={{ pb: 3 }}>
            <LoadError what="Players" error={playersError} />
          </Box>
        )}
        {/* Table */}
        {!playersLoading &&
          !playersLoadFailed &&
          (players.length > 0 ? (
            <Stack spacing={2}>
              <TableFrame>
                <Table sx={{ width: "100%" }}>
                  <TableHead>
                    <TableRow>
                      {PLAYER_COLUMNS.map((column) => (
                        <TableCell key={column.key} align={column.align} sx={{ width: column.width }}>
                          {column.label}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {players.map((player) => {
                      const slot = getPlayerSlot(player);
                      const displayInfo = { ...playerDisplay(player, slot), statusChip: STATUS_CHIPS[slot.state] };
                      const isGameMaster = player.role === "Game Master";
                      const isCurrentUser = player.userId === currentUserId;
                      const canRevokeInvite = slot.state === "pending" && canManageInvites && !campaign.deletedAt;
                      const canEditPlayer =
                        (!campaign.deletedAt &&
                          ((canManagePlayers && (!isGameMaster || slot.state !== "assigned")) || isCurrentUser)) ||
                        canRevokeInvite;

                      return (
                        <TableRow
                          key={player.id}
                          hover
                          sx={{
                            position: "relative",
                            ...ROW_ACTIONS_HOVER_SX,
                          }}
                        >
                          <TableCell>
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                {displayInfo.name}
                              </Typography>
                              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                {displayInfo.email}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <RoleChip
                              icon={
                                isGameMaster ? (
                                  <GMIcon sx={{ fontSize: 14 }} />
                                ) : (
                                  <CharacterIcon sx={{ fontSize: 14 }} />
                                )
                              }
                              label={player.role}
                              color={isGameMaster ? "warning" : "primary"}
                            />
                          </TableCell>
                          <TableCell>
                            {displayInfo.statusChip ? (
                              <StatusChip
                                icon={displayInfo.statusChip.icon}
                                label={displayInfo.statusChip.label}
                                color={displayInfo.statusChip.color}
                              />
                            ) : (
                              <StatusChip
                                icon={<CharacterIcon sx={{ fontSize: 14 }} />}
                                label="Active"
                                color="success"
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            {slot.state === "assigned" ? (
                              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                                {formatDate(player.createdAt)}
                              </Typography>
                            ) : (
                              <EmptyValue />
                            )}
                          </TableCell>
                          <TableCell align="right">
                            {canEditPlayer && (
                              <RowActions>
                                {canManagePlayers && (
                                  <RowAction icon={EditIcon} label="Edit" onClick={() => handleEditPlayer(player)} />
                                )}
                                {slot.state === "pending" && canManageInvites && !campaign.deletedAt && (
                                  <RowAction
                                    icon={RevokeIcon}
                                    label="Revoke Invite"
                                    intent="caution"
                                    onClick={() => handleRevokeInvite(slot.pendingInvite.id)}
                                    disabled={revokeInviteMutation.isPending}
                                  />
                                )}
                                <RowAction
                                  icon={isCurrentUser ? LeaveIcon : DeleteIcon}
                                  label={isCurrentUser ? "Leave" : "Remove"}
                                  intent={isCurrentUser ? "caution" : "destructive"}
                                  onClick={() => handleRemovePlayer(player)}
                                />
                              </RowActions>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableFrame>

              <LoadMoreButton
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                onClick={() => fetchNextPage()}
              />
            </Stack>
          ) : searchQuery ? (
            <NoMatchesState search={searchQuery} />
          ) : (
            <BlankState
              icon={PlayersIcon}
              title="No players in this campaign"
              description="Add players to start your adventure together"
              action={
                canManagePlayers && !campaign.deletedAt ? (
                  <AddButton variant="outlined" size="large" label="Add Your First Player" onClick={handleAddPlayer} />
                ) : undefined
              }
            />
          ))}
      </Stack>
      {/* Add Player Dialog */}
      <AddPlayerDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        form={addForm}
        onSubmit={confirmAddPlayer}
        isLoading={addMutation.isPending}
      />
      {/* Edit Player Dialog */}
      <EditPlayerDialog
        open={editDialog.open}
        onClose={editDialog.close}
        form={editForm}
        onSubmit={confirmEditPlayer}
        isLoading={editMutation.isPending}
        slot={editDialog.target && getPlayerSlot(editDialog.target)}
      />
      {/* Remove Player Dialog */}
      <RemovePlayerDialog
        open={removeDialog.open}
        onClose={removeDialog.close}
        onConfirm={confirmRemovePlayer}
        isLoading={removeMutation.isPending}
        isSelfRemoval={removeDialog.target?.userId === currentUserId}
        slot={removeDialog.target && getPlayerSlot(removeDialog.target)}
      />
      {/* Revoke Invite Dialog */}
      <ConfirmDialog
        open={revokeDialog.open}
        onClose={revokeDialog.close}
        title="Confirm Revoke"
        message="Are you sure you want to revoke this invitation? This action cannot be undone."
        onConfirm={confirmRevokeInvite}
        confirmLabel="Revoke Invitation"
        isLoading={revokeInviteMutation.isPending}
      />
    </SectionContent>
  );
}
