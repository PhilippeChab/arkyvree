import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { AptitudeFormFields, type AptitudeFormData } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { SearchBar, CreateDialog, LoadMoreButton } from "@/client/src/components/common/index.ts";
import { useRulesetPermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { Add as AddIcon, Stars as AptitudesIcon } from "@mui/icons-material";
import { Box, Button, ToggleButton, Typography } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useSearchParam } from "@/client/src/hooks/index.ts";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { aptitudesQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";

const APTITUDES_COLUMNS = [
  { key: "name", label: "Name", width: "30%" },
  { key: "description", label: "Description", width: "70%" },
];

type AptitudesPaginated = InferResponseType<(typeof rpc.api.rulesets)[":id"]["aptitudes"]["$get"], 200>;
type Aptitude = AptitudesPaginated["items"][number];


interface AptitudesSectionProps {
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

export function AptitudesSection({ ruleset, childOnly, onChildOnlyChange }: AptitudesSectionProps) {
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
  } = useRulesetSection<Aptitude, AptitudeFormData>({
    rulesetId: ruleset.id,
    sectionName: "aptitudes",
    label: "Aptitude",
    createFn: async (data) => {
      return parseResponse(rpc.api.rulesets[":id"].aptitudes.$post({
        param: { id: ruleset.id },
        json: data,
      }));
    },
    onCreateSuccess: (created) => navigate(`/rulesets/${ruleset.id}/aptitudes/${created.id}`, { state: { from: location.pathname + location.search } }),
  });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...aptitudesQuery(ruleset.id, { search: searchQuery, childOnly }),
    placeholderData: keepPreviousData,
  });

  const aptitudes = data?.pages.flatMap((page) => page.items) ?? [];

  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);

  const handleRowClick = (aptitude: Aptitude) => {
    navigate(`/rulesets/${ruleset.id}/aptitudes/${aptitude.id}`, { state: { from: location.pathname + location.search } });
  };

  const handleRowMouseEnter = useCallback((aptitude: Aptitude) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.rulesets.entity(ruleset.id, "aptitudes", aptitude.id),
      queryFn: async () => {
        return parseResponse(rpc.api.rulesets[":id"].aptitudes[":aptitudeId"].$get({
          param: { id: ruleset.id, aptitudeId: aptitude.id },
        }));
      },
    });
  }, [queryClient, ruleset.id]);

  const renderCell = (aptitude: Aptitude, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return aptitude.name;
      case "description":
        return (
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            {aptitude.description || "-"}
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
        searchPlaceholder="Search aptitudes..."
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
                Add Aptitude
              </Button>
            )}
          </>
        }
      />

      <RulesetSectionTable
        data={aptitudes}
        isLoading={isLoading}
        columns={APTITUDES_COLUMNS}
        onRowClick={handleRowClick}
        onRowMouseEnter={handleRowMouseEnter}
        renderCell={renderCell}
        emptyIcon={AptitudesIcon}
        emptyTitle="No aptitudes"
        emptyDescription="No aptitudes available for this ruleset."
      />

      <LoadMoreButton
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onClick={() => fetchNextPage()}
      />

      <CreateDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        title="Create New Aptitude"
        form={createForm}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
      >
        <AptitudeFormFields form={createForm} />
      </CreateDialog>
    </Box>
  );
}
