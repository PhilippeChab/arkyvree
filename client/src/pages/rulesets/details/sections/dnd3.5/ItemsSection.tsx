import { Chip, Stack, Typography } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useCallback, useState } from "react";

import {
  CreateDialog,
  EmptyValue,
  LoadMoreButton,
  SearchBar,
  SectionContent,
} from "@/client/src/components/common/index.ts";
import { ItemsIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDialogState, useFormWith, useSearchText } from "@/client/src/hooks/index.ts";
import { formatCost, formatCount, formatWeight } from "@/client/src/lib/formatNumeric.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import type { RulesetItem } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import {
  EMPTY_ITEM,
  ItemFormFields,
  type ItemFormInternal,
  toItemForm,
  toItemPayload,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { DescriptionCell, RulesetSectionTable, SectionActions } from "@/client/src/pages/rulesets/components/index.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionFactory.ts";
import { invalidateRulesetEdit, itemsQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { useOpenEntity, useRulesetPermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { type BulkVariantsFormValues, type VariantRow, variantRow } from "./bulkVariants.ts";
import { BulkVariantsDialog } from "./BulkVariantsDialog.tsx";

type Item = RulesetItem;

const ITEMS_COLUMNS = [
  { key: "name", label: "Name", width: "25%" },
  { key: "type", label: "Type", width: "10%" },
  { key: "template", label: "Template", width: "8%" },
  { key: "cost", label: "Cost", width: "10%" },
  { key: "weight", label: "Weight", width: "10%" },
  { key: "description", label: "Description", width: "37%" },
];

export function ItemsSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { search: searchQuery, searchBarProps: searchTextProps } = useSearchText("search");
  const [duplicateSourceId, setDuplicateSourceId] = useState<string | null>(null);

  const { createDialogOpen, setCreateDialogOpen, createForm, createMutation, handleCreate } = useRulesetSection<
    Item,
    ItemFormInternal
  >({
    createDefaults: EMPTY_ITEM,
    rulesetId: ruleset.id,
    sectionName: "items",
    label: "Item",
    createFn: async (data) => {
      return parseResponse(
        rpc.api.rulesets[":id"].items.$post({
          param: { id: ruleset.id },
          json: toItemPayload(data),
        }),
      );
    },
    onCreateSuccess: (created) => openEntity(`items/${created.id}/customization`),
  });

  const handleAddItem = () => {
    setDuplicateSourceId(null);
    handleCreate();
  };

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...itemsQuery(ruleset.id, { search: searchQuery, childOnly }),
    placeholderData: keepPreviousData,
  });

  const items = pageItems(data);

  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);

  const handleRowClick = (item: Item) => {
    openEntity(`items/${item.id}/customization`);
  };

  const handleDuplicate = (item: Item) => {
    createForm.reset(
      {
        ...toItemForm(item),
        name: `${item.name} (Copy)`,
        // The copy is based on the source: on the template itself, or on the source's own template.
        sourceItemId: item.isTemplate ? item.id : (item.sourceItemId ?? undefined),
        isTemplate: false,
      },
      { keepDefaultValues: true },
    );
    setDuplicateSourceId(item.id);
    setCreateDialogOpen(true);
  };

  const snackbar = useSnackbar();
  const bulkDialog = useDialogState<Item>();
  const bulkForm = useFormWith<BulkVariantsFormValues>({ variants: [] });

  const duplicateMutation = useMutation({
    mutationFn: async ({ sourceId, data }: { data: ItemFormInternal; sourceId: string }) => {
      return parseResponse(
        rpc.api.rulesets[":id"].items[":itemId"].duplicate.$post({
          param: { id: ruleset.id, itemId: sourceId },
          json: toItemPayload(data),
        }),
      );
    },
    onSuccess: (created) => {
      snackbar.success("Item created");
      invalidateRulesetEdit(queryClient, ruleset.id, [QUERY_KEYS.rulesets.section(ruleset.id, "items")]);
      setCreateDialogOpen(false);
      setDuplicateSourceId(null);
      openEntity(`items/${created.id}/customization`);
    },
    onError: (err: Error) => {
      snackbar.error(err, "Failed to duplicate item");
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async ({ itemId, variants }: { itemId: string; variants: VariantRow[] }) => {
      return parseResponse(
        rpc.api.rulesets[":id"].items[":itemId"].variants.$post({
          param: { id: ruleset.id, itemId },
          json: { variants },
        }),
      );
    },
    onSuccess: (data) => {
      const count = data.length;
      snackbar.success(`Created ${formatCount(count, "variant")}`);
      bulkDialog.close();
      invalidateRulesetEdit(queryClient, ruleset.id, [QUERY_KEYS.rulesets.section(ruleset.id, "items")]);
    },
    onError: (err: Error) => {
      snackbar.error(err, "Failed to create variants");
    },
  });

  const handleRowMouseEnter = useCallback(
    (item: Item) => {
      void queryClient.prefetchQuery(customizationEntityQuery(ruleset.id, "items", item.id));
    },
    [queryClient, ruleset.id],
  );

  const renderCell = (item: Item, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return item.name;
      case "template":
        if (item.isTemplate) return <Chip label="Template" size="small" color="info" />;
        if (item.templateName) {
          return (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {item.templateName}
            </Typography>
          );
        }
        return null;
      case "type":
        return (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {item.type || <EmptyValue />}
          </Typography>
        );
      case "cost":
        return <Typography variant="body2">{formatCost(item.costGp) ?? <EmptyValue />}</Typography>;
      case "weight":
        return <Typography variant="body2">{formatWeight(item.weight) ?? <EmptyValue />}</Typography>;
      case "description":
        return <DescriptionCell text={item.description} />;
      default:
        return null;
    }
  };

  return (
    <SectionContent>
      <Stack spacing={3}>
        <SearchBar
          {...searchTextProps}
          searchPlaceholder="Search items…"
          actions={
            <SectionActions
              ruleset={ruleset}
              childOnly={childOnly}
              onChildOnlyChange={onChildOnlyChange}
              addLabel="Add Item"
              onAdd={handleAddItem}
            />
          }
        />
        <Stack spacing={2}>
          <RulesetSectionTable
            what="Items"
            error={error}
            data={items}
            search={searchQuery}
            isLoading={isLoading}
            columns={ITEMS_COLUMNS}
            canEdit={canEdit}
            onDuplicate={handleDuplicate}
            onCreateVariants={(item) => {
              bulkForm.reset({ variants: [variantRow(item, 1)] });
              bulkDialog.openWith(item);
            }}
            onRowClick={handleRowClick}
            onRowMouseEnter={handleRowMouseEnter}
            renderCell={renderCell}
            emptyIcon={ItemsIcon}
            emptyTitle="No items"
            emptyDescription="No items available for this ruleset."
          />
          <LoadMoreButton
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          />
        </Stack>
      </Stack>
      <CreateDialog
        open={createDialogOpen}
        // Add and Duplicate set the source when they open it: clearing it here would unlock the type while it fades out.
        onClose={() => setCreateDialogOpen(false)}
        title="Create New Item"
        form={createForm}
        onSubmit={(data) => {
          if (duplicateSourceId) duplicateMutation.mutate({ sourceId: duplicateSourceId, data });
          else createMutation.mutate(data);
        }}
        isLoading={createMutation.isPending || duplicateMutation.isPending}
      >
        <ItemFormFields form={createForm} rulesetId={ruleset.id} lockType={!!duplicateSourceId} />
      </CreateDialog>
      <BulkVariantsDialog
        open={bulkDialog.open}
        onClose={bulkDialog.close}
        form={bulkForm}
        baseItemName={bulkDialog.target?.name ?? ""}
        baseItemDescription={bulkDialog.target?.description ?? null}
        onSubmit={(variants) => {
          if (!bulkDialog.target) return;
          bulkMutation.mutate({ itemId: bulkDialog.target.id, variants });
        }}
        isLoading={bulkMutation.isPending}
      />
    </SectionContent>
  );
}
