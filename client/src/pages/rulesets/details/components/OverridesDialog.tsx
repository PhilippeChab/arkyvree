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
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import { Link } from "react-router-dom";

import { DialogFooter, DiceSpinner, Modal } from "@/client/src/components/common/index.ts";
import { CompareArrowsIcon, RestoreIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import { rulesetChangesQuery } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { DURATION } from "@/client/src/theme/animations.ts";
import { buildCustomizationPath, CUSTOMIZATION_PAGE_TYPES } from "@/shared/customization/entities.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

type Change = ChangesResponse[number];

type ChangesResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["changes"]["$get"], 200>;

interface OverridesDialogProps {
  open: boolean;
  onClose: () => void;
  rulesetId: string;
  /** The ruleset's base rules, whose words name the entity types */
  baseRules: string;
  canEdit?: boolean;
}

/** A change the fork can undo: an entity it modified or deleted, which the restore route takes back. */
type RestorableChange = Extract<Change, { sourceEntityId: string }>;

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
    ...rulesetChangesQuery(rulesetId),
    enabled: open,
    placeholderData: keepPreviousData,
  });

  const revertMutation = useMutation({
    mutationFn: async ({ entityType, sourceEntityId }: Pick<RestorableChange, "entityType" | "sourceEntityId">) => {
      return parseResponse(
        restoreApi.$post({ param: { id: rulesetId, entityType: getUrlSegment(entityType), entityId: sourceEntityId } }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rulesets.detail(rulesetId) });
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
      <DialogTitle>
        <Stack component="span" direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <CompareArrowsIcon />
          Local changes
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ maxHeight: "60vh" }}>
        {isLoading && <DiceSpinner sx={{ py: 4 }} />}
        <Collapse in={!isLoading && !!changes && changes.length === 0} timeout={DURATION.normal} unmountOnExit>
          <Typography variant="body2" sx={{ color: "text.secondary", py: 2 }}>
            No local changes
          </Typography>
        </Collapse>
        <Collapse in={!isLoading && !!changes && changes.length > 0} timeout={DURATION.moderate} unmountOnExit>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {[...grouped.entries()].map(([entityType, items]) => (
              <Paper key={entityType} variant="outlined" sx={{ overflow: "hidden" }}>
                <Stack direction="row" spacing={1} sx={{ px: 2, py: 1, bgcolor: "action.hover", alignItems: "center" }}>
                  <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 600 }}>
                    {entityTypeLabel(entityType, baseRules, true)}
                  </Typography>
                  <Chip label={items.length} size="small" sx={{ height: 20, fontSize: "0.75rem" }} />
                </Stack>
                <List dense disablePadding>
                  {items.map((change) => {
                    const key = change.status === "deleted" ? change.sourceEntityId : change.entityId;
                    const chipColor =
                      change.status === "modified" ? "info" : change.status === "deleted" ? "error" : "success";
                    const url = getEntityUrl(rulesetId, change);
                    const showRevert = canEdit && change.status !== "added";
                    const rowContent = (
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <ListItemText primary={change.name} sx={{ my: 0, flexGrow: 0 }} />
                        <Chip
                          label={change.status}
                          size="small"
                          color={chipColor}
                          variant="outlined"
                          sx={{ height: 20, fontSize: "0.7rem", flexShrink: 0 }}
                        />
                      </Stack>
                    );
                    return (
                      <ListItem key={key} disablePadding sx={{ gap: 0.5, pr: showRevert ? 1 : 0 }}>
                        {url ? (
                          <ListItemButton component={Link} to={url} target="_blank">
                            {rowContent}
                          </ListItemButton>
                        ) : (
                          <Box sx={{ px: 2, py: 1, flex: 1 }}>{rowContent}</Box>
                        )}
                        {showRevert && (
                          <Tooltip title="Revert to parent version">
                            <span>
                              <IconButton
                                aria-label="Revert to parent version"
                                size="small"
                                onClick={() =>
                                  revertMutation.mutate({
                                    entityType: change.entityType,
                                    sourceEntityId: change.sourceEntityId,
                                  })
                                }
                                disabled={revertMutation.isPending}
                                sx={{ flexShrink: 0 }}
                              >
                                <RestoreIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                      </ListItem>
                    );
                  })}
                </List>
              </Paper>
            ))}
          </Stack>
        </Collapse>
      </DialogContent>
      <DialogFooter onCancel={onClose} cancelLabel="Close" />
    </Modal>
  );
}
