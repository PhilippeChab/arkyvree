import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { SearchBar, CreateDialog, DiceSpinner } from "@/client/src/components/common/index.ts";
import { ENTITY_SORT_OPTIONS, KIND_FILTER_OPTIONS, type EntityKind, type EntitySortField } from "../kindFilterOptions.ts";
import { usePermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { AccessibilityNew as ClassesIcon, Add as AddIcon } from "@mui/icons-material";
import { Box, Button, Chip, MenuItem, TextField, ToggleButton, Typography } from "@mui/material";
import { HIT_DIE_VALUES } from "@/shared/dnd3.5/classes.ts";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { useSearchParam } from "@/client/src/hooks/index.ts";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ClassesSectionProps } from "../../sectionFactory.ts";

const CLASSES_COLUMNS = [
  { key: "name", label: "Name", width: "25%" },
  { key: "hitDie", label: "Hit Die", width: "15%" },
  { key: "description", label: "Description", width: "60%" },
];


type ClassesResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["classes"]["$get"]>;
type ClassesPaginated = Exclude<ClassesResponse, { error: string }>;
type Class = ClassesPaginated["items"][number];

type ClassFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["classes"]["$post"]>["json"];

export function ClassesSection({ ruleset, childOnly, onChildOnlyChange }: ClassesSectionProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const isFork = !!ruleset.rulesetId;
  const [searchQuery, setSearchQuery] = useSearchParam("search");
  const [kindParam, setKindParam] = useSearchParam("kind");
  const [orderByParam, setOrderByParam] = useSearchParam("orderBy");
  const [orderDirParam, setOrderDirParam] = useSearchParam("orderDir");

  const kindFilter: EntityKind = (KIND_FILTER_OPTIONS.find((o) => o.value === kindParam)?.value ?? "pc") as EntityKind;
  const sortField = (orderByParam as EntitySortField) || "name";
  const sortDirection = (orderDirParam as "asc" | "desc") || "asc";

  const {
    currentUserId,
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
      const response = await rpc.api.rulesets[":id"].classes.$post({
        param: { id: ruleset.id },
        json: data,
      });
      if (!response.ok) throw new Error("Failed to create class");
      return response.json();
    },
    onCreateSuccess: (data) => navigate(`/rulesets/${ruleset.id}/classes/${(data as { id: string }).id}/levels`, { state: { from: location.pathname + location.search } }),
  });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: [...queryKeys.rulesets.section(ruleset.id, "classes"), searchQuery, childOnly, kindFilter, sortField, sortDirection],
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.rulesets[":id"].classes.$get({
        param: { id: ruleset.id },
        query: {
          page: pageParam.toString(),
          limit: "10",
          search: searchQuery || undefined,
          childOnly: childOnly ? "true" : undefined,
          kind: kindFilter,
          orderBy: sortField,
          orderDir: sortDirection,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch classes");
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    placeholderData: keepPreviousData,
  });

  const classes = data?.pages.flatMap((page) => page.items) ?? [];

  const { canEdit } = usePermissions(ruleset, currentUserId);

  const handleClassClick = (class_: Class) => {
    navigate(`/rulesets/${ruleset.id}/classes/${class_.id}/levels`, { state: { from: location.pathname + location.search } });
  };

  const handleClassMouseEnter = useCallback((class_: Class) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.rulesets.classDetail(ruleset.id, class_.id),
      queryFn: async () => {
        const response = await rpc.api.rulesets[":id"].classes[":classId"].$get({
          param: { id: ruleset.id, classId: class_.id },
        });
        if (!response.ok) throw new Error("Failed to fetch class");
        return response.json();
      },
    });
    queryClient.prefetchQuery({
      queryKey: queryKeys.rulesets.classLevels(ruleset.id, class_.id),
      queryFn: async () => {
        const response = await rpc.api.rulesets[":id"].classes[":classId"].levels.$get({
          param: { id: ruleset.id, classId: class_.id },
        });
        if (!response.ok) throw new Error("Failed to fetch levels");
        return response.json();
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
        emptyIcon={<ClassesIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2 }} />}
        emptyTitle="No classes"
        emptyDescription="No classes available for this ruleset."
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
        title="Add New Class"
        form={createForm}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
        maxWidth="xs"
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
        <TextField
          {...createForm.register("hd", { valueAsNumber: true })}
          label="Hit Die"
          select
          fullWidth
          value={createForm.watch("hd") ?? 8}
          error={!!createForm.formState.errors.hd}
          helperText={createForm.formState.errors.hd?.message}
        >
          {HIT_DIE_VALUES.map((v) => (
            <MenuItem key={v} value={v}>{`d${v}`}</MenuItem>
          ))}
        </TextField>
      </CreateDialog>
    </Box>
  );
}
