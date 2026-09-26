import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { ClassFormFields, type ClassFormData } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { SearchBar, CreateDialog, LoadMoreButton } from "@/client/src/components/common/index.ts";
import { ENTITY_SORT_OPTIONS, KIND_FILTER_OPTIONS, parseEntityFilters } from "@/client/src/pages/rulesets/details/sections/kindFilterOptions.ts";
import { useRulesetPermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { AccessibilityNew as ClassesIcon, Add as AddIcon } from "@mui/icons-material";
import { Box, Button, Chip, ToggleButton, Typography } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useSearchParam } from "@/client/src/hooks/index.ts";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ClassesSectionProps } from "../../sectionFactory.ts";
import { classesQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";

const CLASSES_COLUMNS = [
  { key: "name", label: "Name", width: "25%" },
  { key: "hitDie", label: "Hit Die", width: "15%" },
  { key: "description", label: "Description", width: "60%" },
];


type ClassesPaginated = InferResponseType<(typeof rpc.api.rulesets)[":id"]["classes"]["$get"], 200>;
type Class = ClassesPaginated["items"][number];


export function ClassesSection({ ruleset, childOnly, onChildOnlyChange }: ClassesSectionProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const isFork = !!ruleset.rulesetId;
  const [searchQuery, setSearchQuery] = useSearchParam("search");
  const [kindParam, setKindParam] = useSearchParam("kind");
  const [orderByParam, setOrderByParam] = useSearchParam("orderBy");
  const [orderDirParam, setOrderDirParam] = useSearchParam("orderDir");

  const { kind: kindFilter, orderBy: sortField, orderDir: sortDirection } =
    parseEntityFilters(kindParam, orderByParam, orderDirParam);

  const {
    createDialogOpen,
    setCreateDialogOpen,
    createForm,
    createMutation,
    handleCreate,
  } = useRulesetSection<Class, ClassFormData>({
    rulesetId: ruleset.id,
    sectionName: "classes",
    label: "Class",
    createDefaults: { hd: 8 },
    createFn: async (data) => {
      return parseResponse(rpc.api.rulesets[":id"].classes.$post({
        param: { id: ruleset.id },
        json: data,
      }));
    },
    onCreateSuccess: (created) => navigate(`/rulesets/${ruleset.id}/classes/${created.id}/levels`, { state: { from: location.pathname + location.search } }),
  });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...classesQuery(ruleset.id, { search: searchQuery, childOnly, kind: kindFilter, orderBy: sortField, orderDir: sortDirection }),
    placeholderData: keepPreviousData,
  });

  const classes = data?.pages.flatMap((page) => page.items) ?? [];

  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);

  const handleClassClick = (class_: Class) => {
    navigate(`/rulesets/${ruleset.id}/classes/${class_.id}/levels`, { state: { from: location.pathname + location.search } });
  };

  const handleClassMouseEnter = useCallback((class_: Class) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.rulesets.classDetail(ruleset.id, class_.id),
      queryFn: async () => {
        return parseResponse(rpc.api.rulesets[":id"].classes[":classId"].$get({
          param: { id: ruleset.id, classId: class_.id },
        }));
      },
    });
    queryClient.prefetchQuery({
      queryKey: queryKeys.rulesets.classLevels(ruleset.id, class_.id),
      queryFn: async () => {
        return parseResponse(rpc.api.rulesets[":id"].classes[":classId"].levels.$get({
          param: { id: ruleset.id, classId: class_.id },
        }));
      },
    });
  }, [queryClient, ruleset.id]);

  const formatHitDie = (hitDie: number) => `d${hitDie}`;

  const renderCell = (klass: Class, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return (
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {klass.name}
          </Typography>
        );
      case "hitDie":
        return (
          <Chip
            label={formatHitDie(klass.hd || 8)}
            size="small"
            color="secondary"
            variant="outlined"
          />
        );
      case "description":
        return (
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical"
            }}>
            {klass.description || "-"}
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
        searchPlaceholder="Search classes..."
        filterOptions={KIND_FILTER_OPTIONS}
        filterValue={kindFilter}
        onFilterChange={(value) => setKindParam(value ?? "pc")}
        sortOptions={ENTITY_SORT_OPTIONS}
        sortField={sortField}
        sortDirection={sortDirection}
        onSortChange={(field, direction) => {
          setOrderByParam(field);
          setOrderDirParam(direction);
        }}
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
                Add Class
              </Button>
            )}
          </>
        }
      />

      <RulesetSectionTable
        data={classes}
        isLoading={isLoading}
        columns={CLASSES_COLUMNS}
        onRowClick={handleClassClick}
        onRowMouseEnter={handleClassMouseEnter}
        renderCell={renderCell}
        emptyIcon={ClassesIcon}
        emptyTitle="No classes"
        emptyDescription="No classes available for this ruleset."
      />

      <LoadMoreButton
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onClick={() => fetchNextPage()}
      />

      <CreateDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        title="Add New Class"
        form={createForm}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
        maxWidth="xs"
      >
        <ClassFormFields form={createForm} />
      </CreateDialog>
    </Box>
  );
}
