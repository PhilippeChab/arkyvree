import { Typography } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useCallback } from "react";

import {
  CreateDialog,
  LoadMoreButton,
  SearchBar,
  SectionContent,
  TagChip,
} from "@/client/src/components/common/index.ts";
import { ClassesIcon } from "@/client/src/components/icons/index.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import {
  type ClassFormData,
  ClassFormFields,
  EMPTY_CLASS,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import {
  DescriptionCell,
  hitDieTag,
  RulesetSectionTable,
  SectionActions,
} from "@/client/src/pages/rulesets/components/index.ts";
import {
  classDetailQuery,
  prefetchClassSection,
} from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import { useEntityFilters } from "@/client/src/pages/rulesets/details/entityFilters.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionFactory.ts";
import { classesQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { useOpenEntity, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

type Class = ClassesPaginated["items"][number];
type ClassesPaginated = InferResponseType<(typeof rpc.api.rulesets)[":id"]["classes"]["$get"], 200>;

const CLASSES_COLUMNS = [
  { key: "name", label: "Name", width: "25%" },
  { key: "hitDie", label: "Hit Die", width: "15%" },
  { key: "description", label: "Description", width: "60%" },
];

export function ClassesSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { search, kind, orderBy, orderDir, searchBarProps } = useEntityFilters();

  const { createForm, handleCreate, createDialogProps } = useRulesetSection<Class, ClassFormData>({
    rulesetId: ruleset.id,
    sectionName: "classes",
    label: "Class",
    createDefaults: EMPTY_CLASS,
    createFn: async (data) => {
      return parseResponse(
        rpc.api.rulesets[":id"].classes.$post({
          param: { id: ruleset.id },
          json: data,
        }),
      );
    },
    onCreateSuccess: (created) => openEntity(`classes/${created.id}/levels`),
  });

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...classesQuery(ruleset.id, { search, childOnly, kind, orderBy, orderDir }),
    placeholderData: keepPreviousData,
  });

  const classes = pageItems(data);

  const handleRowClick = (class_: Class) => {
    openEntity(`classes/${class_.id}/levels`);
  };

  const handleRowMouseEnter = useCallback(
    (class_: Class) => {
      void queryClient.prefetchQuery(classDetailQuery(ruleset.id, class_.id));
      void prefetchClassSection(queryClient, ruleset.id, class_.id, "levels");
    },
    [queryClient, ruleset.id],
  );

  const renderCell = (klass: Class, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return (
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {klass.name}
          </Typography>
        );
      case "hitDie":
        return <TagChip tag={hitDieTag(klass.hd || 8)} />;
      case "description":
        return <DescriptionCell text={klass.description} />;
      default:
        return null;
    }
  };

  return (
    <SectionContent>
      <SearchBar
        {...searchBarProps}
        searchPlaceholder="Search classes..."
        actions={
          <SectionActions
            ruleset={ruleset}
            childOnly={childOnly}
            onChildOnlyChange={onChildOnlyChange}
            addLabel="Add Class"
            onAdd={handleCreate}
          />
        }
      />

      <RulesetSectionTable
        data={classes}
        search={search}
        isLoading={isLoading}
        columns={CLASSES_COLUMNS}
        onRowClick={handleRowClick}
        onRowMouseEnter={handleRowMouseEnter}
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

      <CreateDialog {...createDialogProps} title="Add New Class" maxWidth="xs">
        <ClassFormFields form={createForm} />
      </CreateDialog>
    </SectionContent>
  );
}
