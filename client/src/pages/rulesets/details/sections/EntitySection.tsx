import { Stack } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import {
  BlankState,
  CreateDialog,
  ListToolbar,
  LoadError,
  LoadMoreButton,
  SectionContent,
} from "@/client/src/components/common/index.ts";
import { kindIcon } from "@/client/src/components/icons/index.ts";
import { useRules } from "@/client/src/hooks/index.ts";
import { itemsBeforeLastPage, pageItems } from "@/client/src/lib/pageItems.ts";
import type { EntityKindDescription } from "@/client/src/lib/queries.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import {
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
  SectionActions,
  SectionSearchBar,
} from "@/client/src/pages/rulesets/components/index.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { classDetailQuery } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import { getClassTabs } from "@/client/src/pages/rulesets/details/classes/classTabs.ts";
import { entityQuery } from "@/client/src/pages/rulesets/details/entities/entityDetailQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionProps.ts";
import { entitiesQuery, type EntityRow, entitySegment } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import {
  useEntityColumns,
  useEntityFields,
  useEntityFilters,
  useEntityList,
  useOpenEntity,
  useRulesetSection,
} from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { buildCustomizationPath, CUSTOMIZATION_PAGE_TYPES } from "@/shared/customization/entities.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

/** An entity kind's section: its kind, as its rules describe it, past what every section takes. */
interface EntitySectionProps extends RulesetSectionProps {
  kind: EntityKindDescription;
}

/** The rows a long description's input takes (a mechanic's), as its page's does. */
const LONG_DESCRIPTION_ROWS = 10;

/** The customization page a kind's row opens, if it opens one: a kind no customization page shows is refused. */
function customizationTypeOf(kind: EntityKindDescription) {
  if (kind.opens !== "customization") return undefined;
  if (!isOneOf(kind.type, CUSTOMIZATION_PAGE_TYPES)) throw new Error(`No customization page shows ${kind.type}`);
  return kind.type;
}

/** Where an entity's row opens: its customization page, or its own page (a class's, on its progression). */
function entityPath(kind: EntityKindDescription, id: string) {
  const customization = customizationTypeOf(kind);
  return customization ? buildCustomizationPath(customization, id) : `${getUrlSegment(kind.type)}/${id}`;
}

/**
 * Any entity kind's tab (`kind`), as its rules describe it: its list's columns (`lists`), named in its words, narrowed
 * by what a race or a class is for and sorted where its kind is partitioned, and a new one's form, unless its kind is
 * read-only (an ability's: no search, no create). Each row opens what its kind opens (`opens`).
 */
export function EntitySection({ ruleset, childOnly, onChildOnlyChange, kind }: EntitySectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();
  const { rules } = useRules(ruleset.baseRules);
  const one = entityTypeLabel(kind.type, rules?.words);
  const many = entityTypeLabel(kind.type, rules?.words, true);
  const segment = getUrlSegment(kind.type);

  // A partitioned list narrows by what its race or class is for and sorts; any other searches alone, but a read-only
  // one, which has no search bar to clear the URL's
  const filters = useEntityFilters(ruleset.baseRules);
  const { searchValue, onSearchChange } = filters.searchBarProps;
  const searchBarProps = kind.partitioned ? filters.searchBarProps : { searchValue, onSearchChange };
  const search = kind.readOnly ? "" : filters.search;
  const where = kind.partitioned
    ? { search, childOnly, kind: filters.kind, orderBy: filters.orderBy, orderDir: filters.orderDir }
    : { search, childOnly };

  const { fields } = useEntityFields(ruleset.id, kind.type);
  const { columns: formColumns } = useEntityColumns(ruleset.id, kind.type);
  const { columns, error: listError, list, names } = useEntityList(ruleset.id, kind.type);
  const { createForm, handleCreate, createDialogProps } = useRulesetSection<EntityRow, EntityFormData>({
    rulesetId: ruleset.id,
    sectionName: segment,
    label: one,
    createDefaults: withEntityFields(toEntityForm<EntityFormData>(formColumns), fields),
    createFn: async (data) =>
      parseResponse(
        rpc.api.rulesets[":id"].entities[":entityType"].$post({
          param: { id: ruleset.id, entityType: entitySegment(segment) },
          json: toEntityBody<EntityFormData, EntityFormData>(formColumns, data),
        }),
      ),
    onCreateSuccess: (created) => openEntity(entityPath(kind, created.id)),
  });

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...entitiesQuery(ruleset.id, kind, where),
    placeholderData: keepPreviousData,
  });

  const entities = pageItems(data);

  const handleRowClick = (entity: EntityRow) => {
    openEntity(entityPath(kind, entity.id));
  };

  const handleRowPrefetch = (entity: EntityRow) => {
    const customization = customizationTypeOf(kind);
    if (customization) {
      void queryClient.prefetchQuery(customizationEntityQuery(ruleset.id, customization, entity.id));
    } else if (kind.opens === "progression") {
      void queryClient.prefetchQuery(classDetailQuery(ruleset.id, entity.id));
      // And the tab its page opens on, its first
      void getClassTabs(rules)[0].prefetch?.(queryClient, ruleset.id, entity.id);
    } else {
      void queryClient.prefetchQuery(entityQuery(ruleset.id, kind.type, entity.id));
    }
  };

  const renderCell = (entity: EntityRow, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return entity.name;
      case "description":
        return <DescriptionCell text={entity.description} />;
      default: {
        const column = list?.columns.find((own) => own.key === columnKey);
        return column && <ListValue column={column} entity={entity} names={names} />;
      }
    }
  };

  return (
    <SectionContent>
      <Stack spacing={3}>
        {kind.readOnly ? (
          // No search here: the toolbar holds the actions alone, and only on a fork, which has "Local Changes"
          !!ruleset.rulesetId && (
            <ListToolbar
              actions={<SectionActions ruleset={ruleset} childOnly={childOnly} onChildOnlyChange={onChildOnlyChange} />}
            />
          )
        ) : (
          <SectionSearchBar
            {...searchBarProps}
            searchPlaceholder={`Search ${many.toLowerCase()}…`}
            ruleset={ruleset}
            childOnly={childOnly}
            onChildOnlyChange={onChildOnlyChange}
            addLabel={`Add ${one}`}
            onAdd={handleCreate}
          />
        )}
        {!!listError && <LoadError what="References" error={listError} />}
        <Stack spacing={2}>
          <RulesetSectionTable
            what={many}
            error={error}
            data={entities}
            animationOffset={itemsBeforeLastPage(data)}
            search={search}
            isLoading={isLoading}
            columns={columns}
            onRowClick={handleRowClick}
            onRowPrefetch={handleRowPrefetch}
            renderCell={renderCell}
            empty={
              <BlankState
                icon={kindIcon(kind.icon)}
                title={`No ${many.toLowerCase()}`}
                description={kind.empty ?? `No ${many.toLowerCase()} available for this ruleset.`}
              />
            }
          />
          <LoadMoreButton
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          />
        </Stack>
      </Stack>

      {!kind.readOnly && (
        <CreateDialog {...createDialogProps} title={`Create New ${one}`}>
          <RulesetEntityFormFields
            form={createForm}
            entityType={kind.type}
            rulesetId={ruleset.id}
            descriptionRows={kind.longDescription ? LONG_DESCRIPTION_ROWS : undefined}
            help={kind.fieldHelp}
          />
        </CreateDialog>
      )}
    </SectionContent>
  );
}
