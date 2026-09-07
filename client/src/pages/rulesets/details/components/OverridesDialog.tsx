import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { CompareArrows as CompareArrowsIcon, Restore as RestoreIcon } from "@mui/icons-material";
import { DiceSpinner, Modal } from "@/client/src/components/common/index.ts";
import {
  Box,
  Chip,
  Collapse,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { Link } from "react-router-dom";

type ChangesResponse = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["changes"]["$get"],
  200
>;

type Change = ChangesResponse[number];

const ENTITY_TYPE_LABELS: Record<string, string> = {
  abilities: "Abilities",
  saves: "Saves",
  skills: "Skills",
  feats: "Feats",
  powers: "Powers",
  items: "Items",
  races: "Races",
  languages: "Languages",
  klasses: "Classes",
  aptitudes: "Aptitudes",
};

const CUSTOMIZABLE_TYPES = new Set(["feats", "powers", "items", "races"]);

function getEntityUrl(rulesetId: string, change: Change): string | undefined {
  if (change.status === "deleted") return undefined;
  const entityId = change.entityId;
  const segment = change.entityType === "klasses" ? "classes" : change.entityType;
  return CUSTOMIZABLE_TYPES.has(change.entityType)
    ? `/rulesets/${rulesetId}/${segment}/${entityId}/customization`
    : `/rulesets/${rulesetId}/${segment}/${entityId}`;
}

interface OverridesDialogProps {
  open: boolean;
  onClose: () => void;
  rulesetId: string;
  canEdit?: boolean;
}

export function OverridesDialog({
  open,
  onClose,
  rulesetId,
  canEdit = false,
}: OverridesDialogProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const { data: changes, isLoading } = useQuery({
    queryKey: queryKeys.rulesets.changes(rulesetId),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].changes.$get({
        param: { id: rulesetId },
      });
      if (!response.ok) throw new Error("Failed to fetch changes");
      return response.json();
    },
    enabled: open,
    placeholderData: (prev) => prev,
  });

  const revertMutation = useMutation({
    mutationFn: async ({ entityType, sourceEntityId }: { entityType: string; sourceEntityId: string }) => {
      const response = await rpc.api.rulesets[":id"].entities[":entityType"][":entityId"].restore.$post({
        param: { id: rulesetId, entityType: entityType as never, entityId: sourceEntityId },
      });
      if (!response.ok) throw new Error("Failed to revert");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.detail(rulesetId) });
      snackbar.success("Change reverted");
    },
    onError: (err) => {
      snackbar.error(err, "Failed to revert change");
    },
  });

  // Group changes by entity type
  const grouped = new Map<string, Change[]>();
  if (changes) {
    for (const change of changes) {
      if (!grouped.has(change.entityType)) grouped.set(change.entityType, []);
      grouped.get(change.entityType)!.push(change);
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <CompareArrowsIcon />
        Local changes
      </DialogTitle>
      <DialogContent sx={{ maxHeight: "60vh" }}>
        {isLoading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <DiceSpinner />
          </Box>
        )}
        <Collapse in={!isLoading && !!changes && changes.length === 0} timeout={250} unmountOnExit>
          <Typography variant="body2" sx={{ color: "text.secondary", py: 2 }}>
            No local changes
          </Typography>
        </Collapse>
        <Collapse in={!isLoading && !!changes && changes.length > 0} timeout={300} unmountOnExit>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            {[...grouped.entries()].map(([entityType, items]) => (
              <Paper key={entityType} variant="outlined" sx={{ overflow: "hidden" }}>
                <Box sx={{ px: 2, py: 1, bgcolor: "action.hover", display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {ENTITY_TYPE_LABELS[entityType] ?? entityType}
                  </Typography>
                  <Chip label={items.length} size="small" sx={{ height: 20, fontSize: "0.75rem" }} />
                </Box>
                <List dense disablePadding>
                  {items.map((change) => {
                    const key = change.status === "deleted" ? change.sourceEntityId : change.entityId;
                    const chipColor = change.status === "modified"
                      ? "info"
                      : change.status === "deleted"
                      ? "error"
                      : "success";
                    const url = getEntityUrl(rulesetId, change);
                    const showRevert = canEdit && change.status !== "added";
                    const rowContent = (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <ListItemText primary={change.name} sx={{ my: 0, flexGrow: 0 }} />
                        <Chip
                          label={change.status}
                          size="small"
                          color={chipColor}
                          variant="outlined"
                          sx={{ height: 20, fontSize: "0.7rem", flexShrink: 0 }}
                        />
                      </Box>
                    );
                    return (
                      <ListItem key={key} disablePadding sx={{ pr: showRevert ? 1 : 0 }}>
                        {url ? (
                          <ListItemButton component={Link} to={url} target="_blank">
                            {rowContent}
                          </ListItemButton>
                        ) : (
                          <Box sx={{ px: 2, py: 1, flex: 1 }}>{rowContent}</Box>
                        )}
                        {showRevert && (
                          <Tooltip title="Revert to parent version">
                            <IconButton
                              size="small"
                              onClick={() => revertMutation.mutate({
                                entityType: change.entityType,
                                sourceEntityId: change.sourceEntityId,
                              })}
                              disabled={revertMutation.isPending}
                              sx={{ flexShrink: 0, ml: 0.5 }}
                            >
                              <RestoreIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </ListItem>
                    );
                  })}
                </List>
              </Paper>
            ))}
          </Box>
        </Collapse>
      </DialogContent>
    </Modal>
  );
}
