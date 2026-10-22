import { Box, Stack, ToggleButton } from "@mui/material";
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
import { useRules, useRulesetPermissions, useSearchParam } from "@/client/src/hooks/index.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { itemsBeforeLastPage, pageItems } from "@/client/src/lib/pageItems.ts";
import type { EntityKindDescription } from "@/client/src/lib/queries.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import {
  type ColumnContext,
  type EntityFormData,
  RulesetEntityFormFields,
  toEntityBody,
  toEntityForm,
  withEntityFields,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import {
  AptitudeAutocomplete,
  DescriptionCell,
  ListValue,
  RulesetSectionTable,
  SectionActions,
  SectionSearchBar,
  SpellLevelFilter,
} from "@/client/src/pages/rulesets/components/index.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { classDetailQuery } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import { getClassTabs } from "@/client/src/pages/rulesets/details/classes/classTabs.ts";
import { entityQuery } from "@/client/src/pages/rulesets/details/entities/entityDetailQueries.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionProps.ts";
import { entitiesQuery, type EntityRow, entitySegment } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import {
  useAptitudeFilter,
  useEntityColumns,
  useEntityFields,
  useEntityFilters,
  useEntityList,
  useEntityVariants,
  useOpenEntity,
  useRulesetSection,
  useSpellLevelFilter,
} from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { buildCustomizationPath, CUSTOMIZATION_PAGE_TYPES } from "@/shared/customization/entities.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

import { EntityGroupsTable } from "./EntityGroupsTable.tsx";
import { EntityVariantsDialog } from "./EntityVariantsDialog.tsx";

/** An entity kind's section: its kind, as its rules describe it, past what every section takes. */
interface EntitySectionProps extends RulesetSectionProps {
  kind: EntityKindDescription;
}

/** A new entity's form, which sends every field and needs what a new one needs (a feat's pool). */
const NEW_ENTITY: ColumnContext = { newEntity: true };

/** The customization page a kind's row opens, if it opens one: a kind no customization page shows is refused. */
function customizationTypeOf(kind: EntityKindDescription) {
  if (kind.opens !== "customization") return undefined;
  if (!isOneOf(kind.type, CUSTOMIZATION_PAGE_TYPES)) throw new Error(`No customization page shows ${kind.type}`);
  return kind.type;
}

/**
 * An entity's copy (`copies`: its kind's), as its duplicate's dialog opens on it: its columns (`columns`, its rules')
 * and its fields (`fields`, its ruleset's), named a copy, from the template it's from (the entity's own where it's a
 * template, else the entity's own template), never a template itself.
 */
function duplicateForm(
  entity: EntityRow,
  copies: NonNullable<EntityKindDescription["copies"]>,
  columns: readonly EntityField[],
  fields: readonly EntityField[] | undefined,
): EntityFormData {
  const values: Record<string, unknown> = isRecord(entity) ? entity : {};
  const source = values[copies.template] === true ? entity.id : (values[copies.source] ?? "");
  const form = {
    ...toEntityForm<EntityFormData>(columns, entity),
    name: `${entity.name} (Copy)`,
    [copies.source]: source,
    [copies.template]: false,
  };
  return withEntityFields(form, fields, entity);
}

/** Where an entity's row opens: its customization page, or its own page (a class's, on its progression). */
function entityPath(kind: EntityKindDescription, id: string) {
  const customization = customizationTypeOf(kind);
  return customization ? buildCustomizationPath(customization, id) : `${getUrlSegment(kind.type)}/${id}`;
}

/**
 * Any entity kind's tab (`kind`), as its rules describe it: its list's columns (`lists`), named in its words, narrowed
 * by what a race or a class is for and sorted where its kind is partitioned, by a pool and a power's level where its
 * kind is, its variants grouped under their family where its kind groups them (a toggle undoes it), its rows' copies
 * where its kind copies (a duplicate, variants), and a new one's form, unless its kind is read-only (an ability's: no
 * search, no create). Each row opens what its kind opens (`opens`).
 */
export function EntitySection({ ruleset, childOnly, onChildOnlyChange, kind }: EntitySectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();
  const { rules } = useRules(ruleset.baseRules);
  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);
  const one = entityTypeLabel(kind.type, rules?.words);
  const many = entityTypeLabel(kind.type, rules?.words, true);
  const segment = getUrlSegment(kind.type);

  // A partitioned list narrows by what its race or class is for and sorts; any other searches alone, but a read-only
  // one, which has no search bar to clear the URL's. A kind's pool and level narrow it too, where its kind takes them.
  const filters = useEntityFilters(ruleset.baseRules);
  const { searchValue, onSearchChange } = filters.searchBarProps;
  const searchBarProps = kind.partitioned ? filters.searchBarProps : { searchValue, onSearchChange };
  const search = kind.readOnly ? "" : filters.search;
  const pool = useAptitudeFilter(ruleset.id);
  const levelFilter = useSpellLevelFilter(ruleset.baseRules, true);
  const aptitudeId = kind.pools ? pool.aptitudeId : undefined;
  const level = kind.levels && levelFilter.level !== "" ? levelFilter.level : undefined;
  const where = {
    search,
    childOnly,
    aptitudeId,
    level,
    ...(kind.partitioned && { kind: filters.kind, orderBy: filters.orderBy, orderDir: filters.orderDir }),
  };
  // Its families grouped, unless the URL says otherwise
  const { value: groupedParam, setValue: setGroupedParam } = useSearchParam("grouped", "true");
  const grouped = !!kind.families && oneOf(groupedParam, ["true", "false"], "true") === "true";

  const { fields } = useEntityFields(ruleset.id, kind.type);
  const { columns: formColumns } = useEntityColumns(ruleset.id, kind.type);
  const { columns, error: listError, list, names } = useEntityList(ruleset.id, kind.type);
  const toBody = (data: EntityFormData) => toEntityBody<EntityFormData, EntityFormData>(formColumns, data);
  const { createForm, createDialogProps, duplicateSource, handleCreate, handleDuplicate } = useRulesetSection<
    EntityRow,
    EntityFormData
  >({
    rulesetId: ruleset.id,
    sectionName: segment,
    label: one,
    createDefaults: withEntityFields(
      { ...toEntityForm<EntityFormData>(formColumns), ...(kind.copies && { [kind.copies.template]: false }) },
      fields,
    ),
    createFn: async (data) =>
      parseResponse(
        rpc.api.rulesets[":id"].entities[":entityType"].$post({
          param: { id: ruleset.id, entityType: entitySegment(segment) },
          json: toBody(data),
        }),
      ),
    duplicateFn: async (entityId, data) =>
      parseResponse(
        rpc.api.rulesets[":id"].entities[":entityType"][":entityId"].duplicate.$post({
          param: { id: ruleset.id, entityType: entitySegment(segment), entityId },
          json: toBody(data),
        }),
      ),
    onCreateSuccess: (created) => openEntity(entityPath(kind, created.id)),
  });
  const variants = useEntityVariants(ruleset.id, kind.type);
  const { copies } = kind;

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...entitiesQuery(ruleset.id, kind, where),
    placeholderData: keepPreviousData,
    enabled: !grouped,
  });

  const entities = pageItems(data);

  const handleRowClick = (entity: { id: string }) => {
    openEntity(entityPath(kind, entity.id));
  };

  const handleRowPrefetch = (entity: { id: string }) => {
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

  const empty = {
    icon: kindIcon(kind.icon),
    title: `No ${many.toLowerCase()}`,
    description: kind.empty ?? `No ${many.toLowerCase()} available for this ruleset.`,
  };

  // Its pool's picker and its level's, where its kind narrows by them
  const listFilters = (kind.pools || kind.levels) && (
    <>
      {kind.pools && (
        <Box sx={{ width: { xs: "100%", md: 200 } }}>
          <AptitudeAutocomplete
            rulesetId={ruleset.id}
            value={pool.aptitude}
            loadError={pool.aptitudeError}
            onChange={pool.setAptitude}
            scope={kind.pools}
          />
        </Box>
      )}
      {kind.levels && (
        <SpellLevelFilter
          baseRules={ruleset.baseRules}
          value={levelFilter.level}
          onChange={levelFilter.setLevel}
          allowAll
        />
      )}
    </>
  );

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
            filters={listFilters}
            filtered={aptitudeId !== undefined || level !== undefined}
            ruleset={ruleset}
            childOnly={childOnly}
            onChildOnlyChange={onChildOnlyChange}
            addLabel={`Add ${one}`}
            onAdd={handleCreate}
          >
            {kind.families && (
              <ToggleButton
                value="grouped"
                selected={grouped}
                onChange={() => setGroupedParam(grouped ? "false" : "true")}
                sx={{ textTransform: "none" }}
              >
                Group Families
              </ToggleButton>
            )}
          </SectionSearchBar>
        )}
        {!!listError && <LoadError what="References" error={listError} />}
        {grouped ? (
          <EntityGroupsTable
            rulesetId={ruleset.id}
            entityType={kind.type}
            search={search}
            childOnly={childOnly}
            aptitudeId={aptitudeId}
            what={many}
            empty={empty}
            onRowClick={handleRowClick}
            onRowPrefetch={handleRowPrefetch}
          />
        ) : (
          <Stack spacing={2}>
            <RulesetSectionTable<EntityRow>
              what={many}
              error={error}
              data={entities}
              animationOffset={itemsBeforeLastPage(data)}
              search={search}
              isLoading={isLoading}
              columns={columns}
              canEdit={canEdit}
              onDuplicate={
                copies && ((entity) => handleDuplicate(entity, duplicateForm(entity, copies, formColumns, fields)))
              }
              onCreateVariants={copies && variants.openOn}
              onRowClick={handleRowClick}
              onRowPrefetch={handleRowPrefetch}
              renderCell={renderCell}
              empty={<BlankState {...empty} />}
            />
            <LoadMoreButton
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onClick={() => fetchNextPage()}
            />
          </Stack>
        )}
      </Stack>

      {!kind.readOnly && (
        <CreateDialog
          {...createDialogProps}
          title={`Create New ${one}`}
          maxWidth={kind.wideForm ? "md" : undefined}
          fixedHeight={kind.wideForm === "fixed"}
        >
          {/* A duplicate keeps what its kind locks, while the dialog fades out too */}
          <RulesetEntityFormFields
            form={createForm}
            entityType={kind.type}
            rulesetId={ruleset.id}
            columns={kind.wideForm ? 2 : undefined}
            context={duplicateSource && kind.copies ? { locked: kind.copies.locked, newEntity: true } : NEW_ENTITY}
            longDescription={kind.longDescription}
            help={kind.fieldHelp}
          />
        </CreateDialog>
      )}
      {/* Opened only from a row of a kind that copies */}
      <EntityVariantsDialog
        open={variants.dialog.open}
        onClose={variants.dialog.close}
        form={variants.form}
        baseName={variants.dialog.target?.name ?? ""}
        baseDescription={variants.dialog.target?.description ?? null}
        entityType={kind.type}
        most={copies?.most ?? 0}
        onSubmit={variants.submit}
        pending={variants.pending}
        rulesetId={ruleset.id}
      />
    </SectionContent>
  );
}
