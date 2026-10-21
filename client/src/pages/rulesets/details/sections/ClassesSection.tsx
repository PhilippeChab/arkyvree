import { Stack, Typography } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import {
  BlankState,
  CreateDialog,
  LoadError,
  LoadMoreButton,
  SectionContent,
} from "@/client/src/components/common/index.ts";
import { ClassesIcon } from "@/client/src/components/icons/index.ts";
import { useRules } from "@/client/src/hooks/index.ts";
import { itemsBeforeLastPage, pageItems } from "@/client/src/lib/pageItems.ts";
import {
  ClassFormFields,
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
import {
  classDetailQuery,
  type ClassFormData,
} from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import { getClassTabs } from "@/client/src/pages/rulesets/details/classes/classTabs.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionProps.ts";
import { classesQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import {
  useEntityColumns,
  useEntityFields,
  useEntityFilters,
  useEntityList,
  useOpenEntity,
  useRulesetSection,
} from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

type Class = InferResponseType<(typeof rpc.api.rulesets)[":id"]["classes"]["$get"], 200>["items"][number];

export function ClassesSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { search, kind, orderBy, orderDir, searchBarProps } = useEntityFilters(ruleset.baseRules);
  const { rules } = useRules(ruleset.baseRules);

  const { fields: classFields } = useEntityFields(ruleset.id, "klasses");
  const { columns: classColumns } = useEntityColumns(ruleset.id, "klasses");
  const { columns, error: listError, list, names } = useEntityList(ruleset.id, "klasses");
  const { createForm, handleCreate, createDialogProps } = useRulesetSection<Class, ClassFormData>({
    rulesetId: ruleset.id,
    sectionName: "classes",
    label: "Class",
    createDefaults: withEntityFields(toEntityForm<ClassFormData>(classColumns), classFields),
    createFn: async (data) =>
      parseResponse(
        rpc.api.rulesets[":id"].classes.$post({
          param: { id: ruleset.id },
          json: toEntityBody<ClassFormData, ClassFormData>(classColumns, data),
        }),
      ),
    onCreateSuccess: (created) => openEntity(`classes/${created.id}`),
  });

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...classesQuery(ruleset.id, { search, childOnly, kind, orderBy, orderDir }),
    placeholderData: keepPreviousData,
  });

  const classes = pageItems(data);

  // Its page opens on its first tab
  const handleRowClick = (klass: Class) => {
    openEntity(`classes/${klass.id}`);
  };

  const handleRowPrefetch = (klass: Class) => {
    void queryClient.prefetchQuery(classDetailQuery(ruleset.id, klass.id));
    // And the tab its page opens on, its first
    void getClassTabs(rules)[0].prefetch?.(queryClient, ruleset.id, klass.id);
  };

  const renderCell = (klass: Class, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return (
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {klass.name}
          </Typography>
        );
      case "description":
        return <DescriptionCell text={klass.description} />;
      default: {
        const column = list?.columns.find((own) => own.key === columnKey);
        return column && <ListValue column={column} entity={klass} names={names} />;
      }
    }
  };

  return (
    <SectionContent>
      <Stack spacing={3}>
        <SectionSearchBar
          {...searchBarProps}
          searchPlaceholder="Search classes…"
          ruleset={ruleset}
          childOnly={childOnly}
          onChildOnlyChange={onChildOnlyChange}
          addLabel="Add Class"
          onAdd={handleCreate}
        />
        {!!listError && <LoadError what="References" error={listError} />}
        <Stack spacing={2}>
          <RulesetSectionTable
            what="Classes"
            error={error}
            data={classes}
            animationOffset={itemsBeforeLastPage(data)}
            search={search}
            isLoading={isLoading}
            columns={columns}
            onRowClick={handleRowClick}
            onRowPrefetch={handleRowPrefetch}
            renderCell={renderCell}
            empty={
              <BlankState icon={ClassesIcon} title="No classes" description="No classes available for this ruleset." />
            }
          />
          <LoadMoreButton
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          />
        </Stack>
      </Stack>

      <CreateDialog {...createDialogProps} title="Create New Class">
        <ClassFormFields form={createForm} rulesetId={ruleset.id} />
      </CreateDialog>
    </SectionContent>
  );
}
