import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { CreateDialog, SearchBar, LoadMoreButton } from "@/client/src/components/common/index.ts";
import { MechanicFormFields } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { useRulesetPermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { Add as AddIcon, Gavel as MechanicsIcon } from "@mui/icons-material";
import {
  Box,
  Button,
  ToggleButton,
  Typography,
} from "@mui/material";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { useSearchParam } from "@/client/src/hooks/index.ts";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { mechanicsQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";

const MECHANICS_COLUMNS = [
  { key: "name", label: "Name", width: "30%" },
  { key: "description", label: "Description", width: "70%" },
];

type MechanicsPaginated = InferResponseType<(typeof rpc.api.rulesets)[":id"]["mechanics"]["$get"], 200>;
type Mechanic = MechanicsPaginated["items"][number];

type MechanicFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["mechanics"]["$post"]>["json"];

interface MechanicsSectionProps {
  ruleset: {
    id: string;
    name: string;
    rulesetId?: string | null;
    userId?: string | null;
    status?: string;
  };
  childOnly: boolean;
  onChildOnlyChange: (childOnly: boolean) => void;
}

export function MechanicsSection({ ruleset, childOnly, onChildOnlyChange }: MechanicsSectionProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const isFork = !!ruleset.rulesetId;
  const [searchQuery, setSearchQuery] = useSearchParam("search");

  const {
    createDialogOpen,
    setCreateDialogOpen,
    createForm,
    createMutation,
    handleCreate,
  } = useRulesetSection<Mechanic, MechanicFormData>({
    rulesetId: ruleset.id,
    sectionName: "mechanics",
    label: "Mechanic",
    createFn: async (data) => {
      return parseResponse(rpc.api.rulesets[":id"].mechanics.$post({
        param: { id: ruleset.id },
        json: data,
      }));
    },
    onCreateSuccess: (created) => navigate(`/rulesets/${ruleset.id}/mechanics/${created.id}`, { state: { from: location.pathname + location.search } }),
  });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...mechanicsQuery(ruleset.id, { search: searchQuery, childOnly }),
    placeholderData: keepPreviousData,
  });

  const mechanics = data?.pages.flatMap((page) => page.items) ?? [];

  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);

  const handleRowClick = (mechanic: Mechanic) => {
    navigate(`/rulesets/${ruleset.id}/mechanics/${mechanic.id}`, { state: { from: location.pathname + location.search } });
  };

  const handleRowMouseEnter = useCallback((mechanic: Mechanic) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.rulesets.entity(ruleset.id, "mechanics", mechanic.id),
      queryFn: async () => {
        return parseResponse(rpc.api.rulesets[":id"].mechanics[":mechanicId"].$get({
          param: { id: ruleset.id, mechanicId: mechanic.id },
        }));
      },
    });
  }, [queryClient, ruleset.id]);

  const renderCell = (mechanic: Mechanic, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return mechanic.name;
      case "description":
        return (
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            {mechanic.description || "-"}
          </Typography>
        );
      default:
        return null;
    }
  };

  return (
    <Box sx={{ width: "100%", maxWidth: 1200, margin: "0 auto" }}>
      <SearchBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search mechanics..."
        actions={
          <>
            {isFork && (
              <ToggleButton
                value="childOnly"
                selected={childOnly}
                onChange={() => onChildOnlyChange(!childOnly)}
                sx={{ textTransform: "none" }}
              >
                Local changes
              </ToggleButton>
            )}
            {canEdit && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleCreate}
              >
                Add Mechanic
              </Button>
            )}
          </>
        }
      />

      <RulesetSectionTable
        data={mechanics}
        isLoading={isLoading}
        columns={MECHANICS_COLUMNS}
        onRowClick={handleRowClick}
        onRowMouseEnter={handleRowMouseEnter}
        renderCell={renderCell}
        emptyIcon={MechanicsIcon}
        emptyTitle="No mechanics"
        emptyDescription="No mechanics documented for this ruleset."
      />

      <LoadMoreButton
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onClick={() => fetchNextPage()}
      />

      <CreateDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        title="Create New Mechanic"
        form={createForm}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
        maxWidth="md"
      >
        <MechanicFormFields form={createForm} />
      </CreateDialog>
    </Box>
  );
}
