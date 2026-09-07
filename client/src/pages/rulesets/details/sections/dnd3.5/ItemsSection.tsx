import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { SearchBar, CreateDialog, DiceSpinner } from "@/client/src/components/common/index.ts";
import { usePermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { formatDecimal } from "@/client/src/lib/formatNumeric.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { DECIMAL_PATTERN, type ItemFormInternal, toItemPayload } from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { Add as AddIcon, Construction as ItemsIcon } from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  MenuItem,
  TextField,
  ToggleButton,
  Typography,
} from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useSearchParam } from "@/client/src/hooks/index.ts";
import { useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { UseFormReturn } from "react-hook-form";
import { BulkVariantsDialog } from "@/client/src/pages/rulesets/details/sections/dnd3.5/BulkVariantsDialog.tsx";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";

type ItemsResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["items"]["$get"]>;
type ItemsPaginated = Exclude<ItemsResponse, { error: string }>;
type Item = ItemsPaginated["items"][number];

interface ItemsSectionProps {
  ruleset: { id: string; name: string; rulesetId?: string | null; userId?: string | null; status?: string };
  childOnly: boolean;
  onChildOnlyChange: (childOnly: boolean) => void;
}

import { ITEM_TYPE_OPTIONS, SLOT_OPTIONS } from "@/shared/dnd3.5/items.ts";

const ITEMS_COLUMNS = [
  { key: "name", label: "Name", width: "25%" },
  { key: "type", label: "Type", width: "10%" },
  { key: "template", label: "Template", width: "8%" },
  { key: "cost", label: "Cost", width: "10%" },
  { key: "weight", label: "Weight", width: "10%" },
  { key: "description", label: "Description", width: "37%" },
];

function TemplateSelector({ form, rulesetId, type, disabled }: { form: UseFormReturn<ItemFormInternal>; rulesetId: string; type: string; disabled?: boolean }) {
  const { data: templates, isLoading } = useQuery({
    queryKey: queryKeys.rulesets.section(rulesetId, `templates-${type}`),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].templates.$get({
        param: { id: rulesetId },
        query: { type: type as "Weapon" | "Armor" | "Shield" },
      });
      if (!response.ok) throw new Error("Failed to fetch templates");
      return response.json();
    },
  });

  const value = form.watch("sourceItemId" as keyof ItemFormInternal) || "";

  return (
    <TextField
      {...form.register("sourceItemId" as keyof ItemFormInternal)}
      label={`${type} Template`}
      fullWidth
      select
      value={value}
      disabled={isLoading || disabled}
    >
      <MenuItem value="">None</MenuItem>
      {templates?.map((t) => (
        <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
      ))}
    </TextField>
  );
}

export function ItemsSection({ ruleset, childOnly, onChildOnlyChange }: ItemsSectionProps) {
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
  } = useRulesetSection<Item, ItemFormInternal>({
    rulesetId: ruleset.id,
    sectionName: "items",
    label: "Item",
    createFn: async (data) => {
      const response = await rpc.api.rulesets[":id"].items.$post({
        param: { id: ruleset.id },
        json: toItemPayload(data),
      });
      if (!response.ok) throw new Error("Failed to create item");
      return response.json();
    },
    onCreateSuccess: (data) => navigate(`/rulesets/${ruleset.id}/items/${(data as { id: string }).id}/customization`, { state: { from: location.pathname + location.search } }),
  });

  const handleAddItem = () => {
    createForm.reset({} as ItemFormInternal);
    setDuplicateSourceId(null);
    handleCreate();
  };

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: [...queryKeys.rulesets.section(ruleset.id, "items"), searchQuery, childOnly],
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.rulesets[":id"].items.$get({
        param: { id: ruleset.id },
        query: {
          page: pageParam.toString(),
          limit: "10",
          search: searchQuery || undefined,
          childOnly: childOnly ? "true" : undefined,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch items");
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    placeholderData: keepPreviousData,
  });

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  const { canEdit } = usePermissions(ruleset, currentUserId);

  const handleRowClick = (item: Item) => {
    navigate(`/rulesets/${ruleset.id}/items/${item.id}/customization`, { state: { from: location.pathname + location.search } });
  };

  const [duplicateSourceId, setDuplicateSourceId] = useState<string | null>(null);

  const handleDuplicate = (item: Item) => {
    createForm.reset({
      name: `${item.name} (Copy)`,
      description: item.description ?? "",
      type: item.type ?? "",
      slot: item.slot ?? "",
      costGp: item.costGp ?? "",
      weight: item.weight ?? "",
      sourceItemId: item.isTemplate ? item.id : item.sourceItemId ?? undefined,
      isTemplate: false,
    } as ItemFormInternal, { keepDefaultValues: true });
    setDuplicateSourceId(item.id);
    setCreateDialogOpen(true);
  };

  const snackbar = useSnackbar();
  const [bulkItem, setBulkItem] = useState<Item | null>(null);

  const duplicateMutation = useMutation({
    mutationFn: async ({ sourceId, data }: { sourceId: string; data: ItemFormInternal }) => {
      const response = await rpc.api.rulesets[":id"].items[":itemId"].duplicate.$post({
        param: { id: ruleset.id, itemId: sourceId },
        json: toItemPayload(data),
      });
      if (!response.ok) throw new Error("Failed to duplicate item");
      return response.json();
    },
    onSuccess: (data) => {
      snackbar.success("Item created successfully");
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(ruleset.id, "items") });
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.changes(ruleset.id) });
      setCreateDialogOpen(false);
      setDuplicateSourceId(null);
      createForm.reset({} as ItemFormInternal);
      navigate(`/rulesets/${ruleset.id}/items/${(data as { id: string }).id}/customization`, { state: { from: location.pathname + location.search } });
    },
    onError: (err: Error) => {
      snackbar.error(err, "Failed to duplicate item");
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async ({ itemId, variants }: { itemId: string; variants: Array<{ name: string; description?: string }> }) => {
      const response = await rpc.api.rulesets[":id"].items[":itemId"].variants.$post({
        param: { id: ruleset.id, itemId },
        json: { variants },
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(("message" in err && err.message) || "Failed to create variants");
      }
      return response.json();
    },
    onSuccess: (data) => {
      const count = data.length;
      snackbar.success(`Created ${count} variant${count === 1 ? "" : "s"}`);
      setBulkItem(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(ruleset.id, "items") });
    },
    onError: (err: Error) => {
      snackbar.error(err, "Failed to create variants");
    },
  });

  const handleRowMouseEnter = useCallback((item: Item) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.rulesets.entity(ruleset.id, "items", item.id),
      queryFn: async () => {
        const response = await rpc.api.rulesets[":id"].items[":itemId"].$get({
          param: { id: ruleset.id, itemId: item.id },
        });
        if (!response.ok) throw new Error("Failed to fetch item");
        return response.json();
      },
    });
  }, [queryClient, ruleset.id]);

  const formatCost = (costGp: string | null) => {
    const formatted = formatDecimal(costGp);
    if (formatted === null) return "-";
    const cost = parseFloat(formatted);
    if (cost >= 1000) return `${(cost / 1000).toFixed(1)}k gp`;
    return `${formatted} gp`;
  };

  const formatWeight = (weight: string | null) => {
    const formatted = formatDecimal(weight);
    return formatted === null ? "-" : `${formatted} lb`;
  };

  const renderCell = (item: Item, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return item.name;
      case "template":
        if (item.isTemplate) return <Chip label="Template" size="small" color="info" />;
        if (item.templateName) return (
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>{item.templateName}</Typography>
        );
        return null;
      case "type":
        return (
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            {item.type || "-"}
          </Typography>
        );
      case "cost":
        return (
          <Typography variant="body2">
            {formatCost(item.costGp)}
          </Typography>
        );
      case "weight":
        return <Typography variant="body2">{formatWeight(item.weight)}</Typography>;
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
            {item.description || "-"}
          </Typography>
        );
      default:
        return null;
    }
  };

  const createItemType = createForm.watch("type") as string | undefined;
  const createSlot = createForm.watch("slot") as string | undefined;

  const isTypeWithTemplate = (type?: string) => type === "Weapon" || type === "Armor" || type === "Shield";
  const { setValue: setCreateFormValue } = createForm;

  const handleCreateTypeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newType = e.target.value;
    setCreateFormValue("type", newType as ItemFormInternal["type"], { shouldDirty: true });
    if (isTypeWithTemplate(newType)) {
      setCreateFormValue("slot", "");
      setCreateFormValue("sourceItemId" as keyof ItemFormInternal, "" as never);
    }
  };

  return (
    <Box sx={{ width: "100%", maxWidth: 1200, margin: "0 auto" }}>
      <SearchBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search items..."
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
                onClick={handleAddItem}
              >
                Add Item
              </Button>
            )}
          </>
        }
      />
      <RulesetSectionTable
        data={items}
        isLoading={isLoading}
        columns={ITEMS_COLUMNS}
        canEdit={canEdit}
        onDuplicate={handleDuplicate}
        onCreateVariants={(item) => setBulkItem(item)}
        onRowClick={handleRowClick}
        onRowMouseEnter={handleRowMouseEnter}
        renderCell={renderCell}
        emptyIcon={<ItemsIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2 }} />}
        emptyTitle="No items"
        emptyDescription="No items available for this ruleset."
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
        onClose={() => {
          setCreateDialogOpen(false);
          setDuplicateSourceId(null);
        }}
        title="Create New Item"
        form={createForm}
        onSubmit={(data) => {
          if (duplicateSourceId) {
            duplicateMutation.mutate({ sourceId: duplicateSourceId, data });
          } else {
            createMutation.mutate(data);
          }
        }}
        isLoading={createMutation.isPending || duplicateMutation.isPending}
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
          {...createForm.register("costGp", { pattern: DECIMAL_PATTERN })}
          label="Cost (gp)"
          type="text"
          fullWidth
          error={!!createForm.formState.errors.costGp}
          helperText={createForm.formState.errors.costGp?.message}
          slotProps={{
            htmlInput: { inputMode: "decimal" }
          }}
        />
        <TextField
          {...createForm.register("weight", { pattern: DECIMAL_PATTERN })}
          label="Weight (lbs)"
          type="text"
          fullWidth
          error={!!createForm.formState.errors.weight}
          helperText={createForm.formState.errors.weight?.message}
          slotProps={{
            htmlInput: { inputMode: "decimal" }
          }}
        />
        <TextField
          name="type"
          label="Item Type"
          fullWidth
          select
          value={createItemType || ""}
          onChange={handleCreateTypeChange}
          disabled={!!duplicateSourceId}
        >
          <MenuItem value="">None</MenuItem>
          {ITEM_TYPE_OPTIONS.map((opt) => (
            <MenuItem key={opt} value={opt}>{opt}</MenuItem>
          ))}
        </TextField>
        {isTypeWithTemplate(createItemType)
          ? <TemplateSelector form={createForm} rulesetId={ruleset.id} type={createItemType!} disabled={!!duplicateSourceId} />
          : (
            <TextField
              {...createForm.register("slot")}
              label="Slot"
              fullWidth
              select
              value={createSlot || ""}
              disabled={!!duplicateSourceId}
            >
              <MenuItem value="">None</MenuItem>
              {SLOT_OPTIONS.map((slot) => (
                <MenuItem key={slot} value={slot}>{slot}</MenuItem>
              ))}
            </TextField>
          )}
      </CreateDialog>
      <BulkVariantsDialog
        open={bulkItem !== null}
        onClose={() => setBulkItem(null)}
        baseItemName={bulkItem?.name ?? ""}
        baseItemDescription={bulkItem?.description ?? null}
        onSubmit={(variants) => {
          if (!bulkItem) return;
          bulkMutation.mutate({ itemId: bulkItem.id, variants });
        }}
        isLoading={bulkMutation.isPending}
      />
    </Box>
  );
}
