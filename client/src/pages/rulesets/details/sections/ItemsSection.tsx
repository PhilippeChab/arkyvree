import { Stack } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import {
  BlankState,
  CreateDialog,
  LoadError,
  LoadMoreButton,
  SectionContent,
} from "@/client/src/components/common/index.ts";
import { ItemsIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDialogState, useFormWith, useRulesetPermissions, useSearchText } from "@/client/src/hooks/index.ts";
import { formatCount } from "@/client/src/lib/formatNumeric.ts";
import { itemsBeforeLastPage, pageItems } from "@/client/src/lib/pageItems.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import {
  type ColumnContext,
  type EntityFormData,
  RulesetEntityFormFields,
  toEntityBody,
  toEntityForm,
  withEntityFields,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import {
  DescriptionCell,
  ListValue,
  RulesetSectionTable,
  SectionSearchBar,
} from "@/client/src/pages/rulesets/components/index.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionProps.ts";
import { invalidateRulesetEdit, itemsQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import {
  useEntityColumns,
  useEntityFields,
  useEntityList,
  useOpenEntity,
  useRulesetSection,
} from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { buildCustomizationPath } from "@/shared/customization/entities.ts";

import { type BulkVariantsFormValues, type VariantRow, variantRow } from "./bulkVariants.ts";
import { BulkVariantsDialog } from "./BulkVariantsDialog.tsx";

type Item = InferResponseType<(typeof rpc.api.rulesets)[":id"]["items"]["$get"], 200>["items"][number];

/** A duplicate's form: a new item that keeps its source's type, slot and template. */
const DUPLICATE_ITEM: ColumnContext = { locked: ["slot", "sourceItemId", "type"], newEntity: true };

/** A new item's form, which sends every field: a type change drops the template's values it holds. */
const NEW_ITEM: ColumnContext = { newEntity: true };

/**
 * An item's copy, as its duplicate's dialog opens on it: based on the item, or on the item's own template, with its
 * columns (`columns`, its rules') and its fields (`fields`, its ruleset's)
 */
function duplicateForm(
  item: Item,
  columns: readonly EntityField[],
  fields: readonly EntityField[] | undefined,
): EntityFormData {
  const form = {
    ...toEntityForm<EntityFormData>(columns, item),
    name: `${item.name} (Copy)`,
    sourceItemId: item.isTemplate ? item.id : (item.sourceItemId ?? ""),
    isTemplate: false,
  };
  return withEntityFields(form, fields, item);
}

export function ItemsSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { search: searchQuery, searchBarProps: searchTextProps } = useSearchText("search");

  const { fields: itemFields } = useEntityFields(ruleset.id, "items");
  const { columns: itemColumns } = useEntityColumns(ruleset.id, "items");
  const { columns, error: listError, list, names } = useEntityList(ruleset.id, "items");
  const toItemBody = (data: EntityFormData) => toEntityBody<EntityFormData, EntityFormData>(itemColumns, data);
  const { createForm, createDialogProps, duplicateSource, handleCreate, handleDuplicate } = useRulesetSection<
    Item,
    EntityFormData
  >({
    createDefaults: withEntityFields({ ...toEntityForm<EntityFormData>(itemColumns), isTemplate: false }, itemFields),
    rulesetId: ruleset.id,
    sectionName: "items",
    label: "Item",
    createFn: async (data) =>
      parseResponse(
        rpc.api.rulesets[":id"].items.$post({
          param: { id: ruleset.id },
          json: toItemBody(data),
        }),
      ),
    duplicateFn: async (itemId, data) =>
      parseResponse(
        rpc.api.rulesets[":id"].items[":itemId"].duplicate.$post({
          param: { id: ruleset.id, itemId },
          json: toItemBody(data),
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
      snackbar.success(`${formatCount(count, "variant")} created`);
      bulkDialog.close();
      void invalidateRulesetEdit(queryClient, ruleset.id, [QUERY_KEYS.rulesets.section(ruleset.id, "items")]);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to create variants");
    },
  });

  const handleRowPrefetch = (item: Item) => {
    void queryClient.prefetchQuery(customizationEntityQuery(ruleset.id, "items", item.id));
  };

  const renderCell = (item: Item, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return item.name;
      case "description":
        return <DescriptionCell text={item.description} />;
      default: {
        const column = list?.columns.find((own) => own.key === columnKey);
        return column && <ListValue column={column} entity={item} names={names} />;
      }
    }
  };

  return (
    <SectionContent>
      <Stack spacing={3}>
        <SectionSearchBar
          {...searchTextProps}
          searchPlaceholder="Search items…"
          ruleset={ruleset}
          childOnly={childOnly}
          onChildOnlyChange={onChildOnlyChange}
          addLabel="Add Item"
          onAdd={handleCreate}
        />
        {!!listError && <LoadError what="References" error={listError} />}
        <Stack spacing={2}>
          <RulesetSectionTable
            what="Items"
            error={error}
            data={items}
            animationOffset={itemsBeforeLastPage(data)}
            search={searchQuery}
            isLoading={isLoading}
            columns={columns}
            canEdit={canEdit}
            onDuplicate={(item) => handleDuplicate(item, duplicateForm(item, itemColumns, itemFields))}
            onCreateVariants={(item) => {
              bulkForm.reset({ variants: [variantRow(item, 1)] });
              bulkDialog.openWith(item);
            }}
            onRowClick={handleRowClick}
            onRowPrefetch={handleRowPrefetch}
            renderCell={renderCell}
            empty={<BlankState icon={ItemsIcon} title="No items" description="No items available for this ruleset." />}
          />
          <LoadMoreButton
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          />
        </Stack>
      </Stack>
      <CreateDialog {...createDialogProps} title="Create New Item" maxWidth="md">
        {/* A duplicate keeps its source's type, while the dialog fades out too */}
        <RulesetEntityFormFields
          entityType="items"
          columns={2}
          form={createForm}
          rulesetId={ruleset.id}
          context={duplicateSource ? DUPLICATE_ITEM : NEW_ITEM}
        />
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
        pending={bulkMutation.isPending}
        rulesetId={ruleset.id}
      />
    </SectionContent>
  );
}
