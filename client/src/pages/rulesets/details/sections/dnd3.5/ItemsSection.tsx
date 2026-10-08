import { Stack, Typography } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import { useCallback } from "react";

import {
  CreateDialog,
  EmptyValue,
  LoadMoreButton,
  SearchBar,
  SectionContent,
  StatusChip,
} from "@/client/src/components/common/index.ts";
import { ItemsIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDialogState, useFormWith, useSearchText } from "@/client/src/hooks/index.ts";
import { formatCost, formatCount, formatWeight } from "@/client/src/lib/formatNumeric.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
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
import { buildCustomizationPath } from "@/shared/customization/entities.ts";

import { type BulkVariantsFormValues, type VariantRow, variantRow } from "./bulkVariants.ts";
import { BulkVariantsDialog } from "./BulkVariantsDialog.tsx";

type Item = ItemsPaginated["items"][number];
type ItemsPaginated = InferResponseType<(typeof rpc.api.rulesets)[":id"]["items"]["$get"], 200>;

const ITEMS_COLUMNS = [
  { key: "name", label: "Name", width: "25%" },
  { key: "type", label: "Type", width: "10%" },
  { key: "template", label: "Template", width: "8%" },
  { key: "cost", label: "Cost", width: "10%" },
  { key: "weight", label: "Weight", width: "10%" },
  { key: "description", label: "Description", width: "37%" },
];

/** An item's copy, as its duplicate's dialog opens on it: based on the item, or on the item's own template */
function duplicateForm(item: Item): ItemFormInternal {
  return {
    ...toItemForm(item),
    name: `${item.name} (Copy)`,
    sourceItemId: item.isTemplate ? item.id : (item.sourceItemId ?? ""),
    isTemplate: false,
  };
}

export function ItemsSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { search: searchQuery, searchBarProps: searchTextProps } = useSearchText("search");

  const { createForm, createDialogProps, duplicateSource, handleCreate, handleDuplicate } = useRulesetSection<
    Item,
    ItemFormInternal
  >({
    createDefaults: EMPTY_ITEM,
    rulesetId: ruleset.id,
    sectionName: "items",
    label: "Item",
    createFn: async (data) =>
      parseResponse(
        rpc.api.rulesets[":id"].items.$post({
          param: { id: ruleset.id },
          json: toItemPayload(data),
        }),
      ),
    duplicateFn: async (itemId, data) =>
      parseResponse(
        rpc.api.rulesets[":id"].items[":itemId"].duplicate.$post({
          param: { id: ruleset.id, itemId },
          json: toItemPayload(data),
        }),
      ),
    onCreateSuccess: (created) => openEntity(buildCustomizationPath("items", created.id)),
  });

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...itemsQuery(ruleset.id, { search: searchQuery, childOnly }),
    placeholderData: keepPreviousData,
  });

  const items = pageItems(data);

  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);

  const handleRowClick = (item: Item) => {
    openEntity(buildCustomizationPath("items", item.id));
  };

  const snackbar = useSnackbar();
  const bulkDialog = useDialogState<Item>();
  const bulkForm = useFormWith<BulkVariantsFormValues>({ variants: [] });

  const bulkMutation = useMutation({
    mutationFn: async ({ itemId, variants }: { itemId: string; variants: VariantRow[] }) =>
      parseResponse(
        rpc.api.rulesets[":id"].items[":itemId"].variants.$post({
          param: { id: ruleset.id, itemId },
          json: { variants },
        }),
      ),
    onSuccess: (data) => {
      const count = data.length;
      snackbar.success(`Created ${formatCount(count, "variant")}`);
      bulkDialog.close();
      invalidateRulesetEdit(queryClient, ruleset.id, [QUERY_KEYS.rulesets.section(ruleset.id, "items")]);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to create variants");
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
        if (item.isTemplate) return <StatusChip label="Template" color="info" />;
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
              onAdd={handleCreate}
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
            onDuplicate={(item) => handleDuplicate(item, duplicateForm(item))}
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
      <CreateDialog {...createDialogProps} title="Create New Item">
        {/* A duplicate keeps its source's type, while the dialog fades out too */}
        <ItemFormFields form={createForm} rulesetId={ruleset.id} lockType={!!duplicateSource} />
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
