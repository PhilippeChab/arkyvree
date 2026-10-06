import { Box, Button, Typography } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ConfirmDialog,
  DataTable,
  type DataTableColumn,
  LoadError,
  LoadMoreButton,
  type RowAction,
  SearchBar,
  SectionContent,
  type Tag,
  TagChip,
} from "@/client/src/components/common/index.ts";
import {
  AddIcon,
  DeleteIcon,
  EditIcon,
  GameMasterIcon,
  LeaveIcon,
  PendingIcon,
  PlayerIcon,
  RevokeIcon,
  UnassignedIcon,
} from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith, useSearchText } from "@/client/src/hooks/index.ts";
import { formatDate } from "@/client/src/lib/formatDate.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import type { CampaignDetail } from "@/client/src/lib/queries.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import {
  AddPlayerDialog,
  type CampaignPlayer,
  EditPlayerDialog,
  getPlayerSlot,
  playerDisplay,
  type PlayerFormData,
  type PlayerState,
  RemovePlayerDialog,
  toPlayerPayload,
} from "@/client/src/pages/campaigns/components/index.ts";
import { campaignPlayersQuery } from "@/client/src/pages/campaigns/details/sectionQueries.ts";
import { useCampaignPermissions } from "@/client/src/pages/campaigns/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import type { CampaignRole } from "@/shared/enums.ts";

interface PlayersSectionProps {
  campaign: CampaignDetail;
}

/** The players' columns; each row's actions sit over its last. */
const PLAYER_COLUMNS: DataTableColumn[] = [
  { key: "player", label: "Player", width: "25%" },
  { key: "role", label: "Role", width: "25%" },
  { key: "status", label: "Status", width: "25%" },
  { key: "joined", label: "Joined", width: "25%" },
];

/** A player's role in the campaign */
const PLAYER_ROLES = {
  "Game Master": { icon: GameMasterIcon, label: "Game Master", color: "warning" },
  "Player Character": { icon: PlayerIcon, label: "Player Character", color: "primary" },
} as const satisfies Record<CampaignRole, Tag>;

/** Where a player's slot stands */
const PLAYER_STATES = {
  assigned: { icon: PlayerIcon, label: "Active", color: "success" },
  pending: { icon: PendingIcon, label: "Invite Pending", color: "warning" },
  unassigned: { icon: UnassignedIcon, label: "Unassigned", color: "default" },
} as const satisfies Record<PlayerState, Tag>;

export function PlayersSection({ campaign }: PlayersSectionProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  // Kept after its dialog closes, so the dialog doesn't change while it fades out.
  const [selectedPlayer, setSelectedPlayer] = useState<CampaignPlayer | null>(null);
  const selectedSlot = selectedPlayer && getPlayerSlot(selectedPlayer);

  // Search state with debounce
  const { search: searchQuery, searchBarProps: searchTextProps } = useSearchText("playerSearch");

  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [selectedInviteId, setSelectedInviteId] = useState<string | null>(null);

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

  const addMutation = useMutation({
    mutationFn: async (data: PlayerFormData) => {
      return parseResponse(
        rpc.api.campaigns[":id"].players.$post({
          param: { id: campaign.id },
          json: toPlayerPayload(data),
        }),
      );
    },
    onSuccess: () => {
      snackbar.success("Player added");
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.detail(campaign.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.section(campaign.id, "players") });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.lists });
      setAddDialogOpen(false);
      addForm.reset();
    },
    onError: (error) => {
      snackbar.error(error, "Failed to add player");
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ playerId, data }: { playerId: string; data: PlayerFormData }) => {
      return parseResponse(
        rpc.api.campaigns[":id"].players[":playerId"].$put({
          param: { id: campaign.id, playerId },
          json: toPlayerPayload(data),
        }),
      );
    },
    onSuccess: () => {
      snackbar.success("Player updated");
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.detail(campaign.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.section(campaign.id, "players") });
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.lists });
      setEditDialogOpen(false);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to update player");
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (playerId: string) => {
      return parseResponse(
        rpc.api.campaigns[":id"].players[":playerId"].$delete({
          param: { id: campaign.id, playerId },
        }),
      );
    },
    onSuccess: () => {
      const removedSelf = selectedPlayer?.userId === currentUserId;
      snackbar.success(removedSelf ? "You left the campaign" : "Player removed");
      if (removedSelf) {
        navigate("/campaigns", { replace: true });
        queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.lists });
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.detail(campaign.id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.section(campaign.id, "players") });
        queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.section(campaign.id, "characters") });
        queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.lists });
        setRemoveDialogOpen(false);
      }
    },
    onError: (error) => {
      snackbar.error(error, "Failed to remove player");
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      return parseResponse(
        rpc.api.campaigns.invites[":inviteId"].revoke.$post({
          param: { inviteId },
        }),
      );
    },
    onSuccess: () => {
      snackbar.success("Invitation revoked");
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.section(campaign.id, "players") });
      setRevokeDialogOpen(false);
      setSelectedInviteId(null);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to revoke invitation");
    },
  });

  const handleRevokeInvite = (inviteId: string) => {
    setSelectedInviteId(inviteId);
    setRevokeDialogOpen(true);
  };

  const confirmRevokeInvite = () => {
    if (selectedInviteId) {
      revokeInviteMutation.mutate(selectedInviteId);
    }
  };

  const handleAddPlayer = () => {
    addForm.reset();
    setAddDialogOpen(true);
  };

  const confirmAddPlayer = (data: PlayerFormData) => {
    addMutation.mutate(data);
  };

  const handleEditPlayer = (player: CampaignPlayer) => {
    setSelectedPlayer(player);
    editForm.reset({
      role: player.role,
      email: "",
    });
    setEditDialogOpen(true);
  };

  const confirmEditPlayer = (data: PlayerFormData) => {
    if (!selectedPlayer) return;
    editMutation.mutate({ playerId: selectedPlayer.id, data });
  };

  const handleRemovePlayer = (player: CampaignPlayer) => {
    setSelectedPlayer(player);
    setRemoveDialogOpen(true);
  };

  const confirmRemovePlayer = () => {
    if (!selectedPlayer) return;
    removeMutation.mutate(selectedPlayer.id);
  };

  const renderPlayerCell = (player: CampaignPlayer, column: string) => {
    const slot = getPlayerSlot(player);
    switch (column) {
      case "player": {
        const { name, email } = playerDisplay(player, slot);
        return (
          <Box>
            <Typography variant="body2" sx={{ fontWeight: "fontWeightMedium" }}>
              {name}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {email}
            </Typography>
          </Box>
        );
      }
      case "role":
        return <TagChip tag={PLAYER_ROLES[player.role]} />;
      case "status":
        return <TagChip tag={PLAYER_STATES[slot.state]} />;
      default:
        return slot.state === "assigned" ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {formatDate(player.createdAt)}
          </Typography>
        ) : (
          <Typography variant="body2" sx={{ color: "text.disabled" }}>
            —
          </Typography>
        );
    }
  };

  // Edit for whoever manages players, revoke a pending invite, remove a player or leave
  const playerActions = (player: CampaignPlayer): RowAction[] => {
    const slot = getPlayerSlot(player);
    const isCurrentUser = player.userId === currentUserId;
    const pendingInviteId =
      slot.state === "pending" && canManageInvites && !campaign.deletedAt ? slot.pendingInvite.id : null;
    const canEditPlayer =
      (!campaign.deletedAt &&
        ((canManagePlayers && (player.role !== "Game Master" || slot.state !== "assigned")) || isCurrentUser)) ||
      pendingInviteId !== null;
    if (!canEditPlayer) return [];
    return [
      ...(canManagePlayers
        ? [
            {
              label: "Edit",
              icon: <EditIcon fontSize="small" />,
              onClick: () => handleEditPlayer(player),
              color: "primary" as const,
            },
          ]
        : []),
      ...(pendingInviteId
        ? [
            {
              label: "Revoke Invite",
              icon: <RevokeIcon fontSize="small" />,
              onClick: () => handleRevokeInvite(pendingInviteId),
              color: "warning" as const,
              disabled: revokeInviteMutation.isPending,
            },
          ]
        : []),
      {
        label: isCurrentUser ? "Leave" : "Remove",
        icon: isCurrentUser ? <LeaveIcon fontSize="small" /> : <DeleteIcon fontSize="small" />,
        onClick: () => handleRemovePlayer(player),
        color: isCurrentUser ? "warning" : "error",
      },
    ];
  };

  return (
    <SectionContent>
      {/* Header */}
      <Typography component="h2" variant="h5">
        Players
      </Typography>
      <SearchBar
        {...searchTextProps}
        searchPlaceholder="Search players..."
        actions={
          canManagePlayers &&
          !campaign.deletedAt && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddPlayer}>
              Add Player
            </Button>
          )
        }
      />
      {playersError ? (
        <LoadError what="Players" error={playersError} />
      ) : (
        <>
          <DataTable
            rows={players}
            isLoading={playersLoading}
            columns={PLAYER_COLUMNS}
            renderCell={renderPlayerCell}
            actions={playerActions}
            search={searchQuery}
            empty={{
              icon: PlayerIcon,
              title: "No players in this campaign",
              description: "Add players to start your adventure together",
              action:
                canManagePlayers && !campaign.deletedAt ? (
                  <Button variant="outlined" startIcon={<AddIcon />} size="large" onClick={handleAddPlayer}>
                    Add Your First Player
                  </Button>
                ) : undefined,
            }}
          />
          <LoadMoreButton
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          />
        </>
      )}
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
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        form={editForm}
        onSubmit={confirmEditPlayer}
        isLoading={editMutation.isPending}
        slot={selectedSlot}
      />
      {/* Remove Player Dialog */}
      <RemovePlayerDialog
        open={removeDialogOpen}
        onClose={() => setRemoveDialogOpen(false)}
        onConfirm={confirmRemovePlayer}
        isLoading={removeMutation.isPending}
        isSelfRemoval={selectedPlayer?.userId === currentUserId}
        slot={selectedSlot}
      />
      {/* Revoke Invite Dialog */}
      <ConfirmDialog
        open={revokeDialogOpen}
        onClose={() => setRevokeDialogOpen(false)}
        title="Confirm Revoke"
        message="Are you sure you want to revoke this invitation? This action cannot be undone."
        onConfirm={confirmRevokeInvite}
        confirmLabel="Revoke Invitation"
        isLoading={revokeInviteMutation.isPending}
      />
    </SectionContent>
  );
}
