import {
  Box,
  Button,
  Chip,
  Collapse,
  DialogActions,
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

import { DiceSpinner, Modal } from "@/client/src/components/common/index.ts";
import { CompareIcon, RestoreIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { buildCustomizationPath, CUSTOMIZATION_PAGE_TYPES } from "@/shared/customization/entities.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

type ChangesResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["changes"]["$get"], 200>;

type Change = ChangesResponse[number];

/** A change the fork can undo: an entity it modified or deleted, which the restore route takes back. */
type RestorableChange = Extract<Change, { sourceEntityId: string }>;

interface OverridesDialogProps {
  open: boolean;
  onClose: () => void;
  rulesetId: string;
  /** The ruleset's base rules, whose words name the entity types */
  baseRules: string;
  canEdit?: boolean;
}

const restoreApi = rpc.api.rulesets[":id"].entities[":entityType"][":entityId"].restore;

function getEntityUrl(rulesetId: string, change: Change): string | undefined {
  if (change.status === "deleted") return undefined;
  const { entityType, entityId } = change;
  return isOneOf(entityType, CUSTOMIZATION_PAGE_TYPES)
    ? `/rulesets/${rulesetId}/${buildCustomizationPath(entityType, entityId)}`
    : `/rulesets/${rulesetId}/${getUrlSegment(entityType)}/${entityId}`;
}

export function OverridesDialog({ open, onClose, rulesetId, baseRules, canEdit = false }: OverridesDialogProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const { data: changes, isLoading } = useQuery({
    queryKey: queryKeys.rulesets.changes(rulesetId),
    queryFn: async () => {
      return parseResponse(
        rpc.api.rulesets[":id"].changes.$get({
          param: { id: rulesetId },
        }),
      );
    },
    enabled: open,
    placeholderData: (prev) => prev,
  });

  const revertMutation = useMutation({
    mutationFn: async ({ entityType, sourceEntityId }: Pick<RestorableChange, "entityType" | "sourceEntityId">) => {
      return parseResponse(
        restoreApi.$post({ param: { id: rulesetId, entityType: getUrlSegment(entityType), entityId: sourceEntityId } }),
      );
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
      const group = grouped.get(change.entityType) ?? [];
      group.push(change);
      grouped.set(change.entityType, group);
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <CompareIcon />
        Local changes
      </DialogTitle>
      <DialogContent sx={{ maxHeight: "60vh" }}>
        {isLoading && <DiceSpinner sx={{ py: 4 }} />}
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
                    {entityTypeLabel(entityType, baseRules, true)}
                  </Typography>
                  <Chip label={items.length} size="small" sx={{ height: 20, fontSize: "0.75rem" }} />
                </Box>
                <List dense disablePadding>
                  {items.map((change) => {
                    const key = change.status === "deleted" ? change.sourceEntityId : change.entityId;
                    const chipColor =
                      change.status === "modified" ? "info" : change.status === "deleted" ? "error" : "success";
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
                              onClick={() =>
                                revertMutation.mutate({
                                  entityType: change.entityType,
                                  sourceEntityId: change.sourceEntityId,
                                })
                              }
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
      <DialogActions>
        <Button onClick={onClose} variant="outlined" color="inherit">
          Close
        </Button>
      </DialogActions>
    </Modal>
  );
}
