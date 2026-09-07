import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { SearchBar, CreateDialog, DiceSpinner } from "@/client/src/components/common/index.ts";
import { usePermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { Add as AddIcon, Stars as AptitudesIcon } from "@mui/icons-material";
import { Box, Button, TextField, ToggleButton, Typography } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { useSearchParam } from "@/client/src/hooks/index.ts";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const APTITUDES_COLUMNS = [
  { key: "name", label: "Name", width: "30%" },
  { key: "description", label: "Description", width: "70%" },
];

type AptitudesResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["aptitudes"]["$get"]>;
type AptitudesPaginated = Exclude<AptitudesResponse, { error: string }>;
type Aptitude = AptitudesPaginated["items"][number];

type AptitudeFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["aptitudes"]["$post"]
>["json"];

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
    currentUserId,
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
      const response = await rpc.api.rulesets[":id"].aptitudes.$post({
        param: { id: ruleset.id },
        json: data,
      });
      if (!response.ok) throw new Error("Failed to create aptitude");
      return response.json();
    },
    onCreateSuccess: (data) => navigate(`/rulesets/${ruleset.id}/aptitudes/${(data as { id: string }).id}`, { state: { from: location.pathname + location.search } }),
  });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: [...queryKeys.rulesets.section(ruleset.id, "aptitudes"), searchQuery, childOnly],
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.rulesets[":id"].aptitudes.$get({
        param: { id: ruleset.id },
        query: {
          page: pageParam.toString(),
          limit: "10",
          search: searchQuery || undefined,
          childOnly: childOnly ? "true" : undefined,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch aptitudes");
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    placeholderData: keepPreviousData,
  });

  const aptitudes = data?.pages.flatMap((page) => page.items) ?? [];

  const { canEdit } = usePermissions(ruleset, currentUserId);

  const handleRowClick = (aptitude: Aptitude) => {
    navigate(`/rulesets/${ruleset.id}/aptitudes/${aptitude.id}`, { state: { from: location.pathname + location.search } });
  };

  const handleRowMouseEnter = useCallback((aptitude: Aptitude) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.rulesets.entity(ruleset.id, "aptitudes", aptitude.id),
      queryFn: async () => {
        const response = await rpc.api.rulesets[":id"].aptitudes[":aptitudeId"].$get({
          param: { id: ruleset.id, aptitudeId: aptitude.id },
        });
        if (!response.ok) throw new Error("Failed to fetch aptitude");
        return response.json();
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
        emptyIcon={<AptitudesIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2 }} />}
        emptyTitle="No aptitudes"
        emptyDescription="No aptitudes available for this ruleset."
      />

      {hasNextPage && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
          <Button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            variant="outlined"
          >
            <DiceSpinner size="small" loading={isFetchingNextPage}>Load More</DiceSpinner>
          </Button>
        </Box>
      )}

      <CreateDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        title="Create New Aptitude"
        form={createForm}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
      >
        <TextField
          {...createForm.register("name", { required: "Name is required" })}
          label="Name"
          fullWidth
          error={!!createForm.formState.errors.name}
          helperText={createForm.formState.errors.name?.message}
        />
        <TextField
          {...createForm.register("description")}
          label="Description"
          fullWidth
          multiline
          minRows={3}
          sx={{ "& textarea": { resize: "vertical" } }}
        />
      </CreateDialog>
    </Box>
  );
}
