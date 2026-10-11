import { Stack, Typography } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import {
  CreateDialog,
  LoadMoreButton,
  SearchBar,
  SectionContent,
  ValueChip,
} from "@/client/src/components/common/index.ts";
import { ClassesIcon } from "@/client/src/components/icons/index.ts";
import { formatDie } from "@/client/src/lib/formatNumeric.ts";
import { itemsBeforeLastPage, pageItems } from "@/client/src/lib/pageItems.ts";
import { ClassFormFields, EMPTY_CLASS } from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { DescriptionCell, RulesetSectionTable, SectionActions } from "@/client/src/pages/rulesets/components/index.ts";
import {
  classDetailQuery,
  type ClassFormData,
  classLevelsQuery,
} from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionFactory.ts";
import { classesQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { useEntityFilters, useOpenEntity, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

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

  const { search, kind, orderBy, orderDir, searchBarProps } = useEntityFilters(ruleset.baseRules);

  const { createForm, handleCreate, createDialogProps } = useRulesetSection<Class, ClassFormData>({
    rulesetId: ruleset.id,
    sectionName: "classes",
    label: "Class",
    createDefaults: EMPTY_CLASS,
    createFn: async (data) =>
      parseResponse(
        rpc.api.rulesets[":id"].classes.$post({
          param: { id: ruleset.id },
          json: data,
        }),
      ),
    onCreateSuccess: (created) => openEntity(`classes/${created.id}/levels`),
  });

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...classesQuery(ruleset.id, { search, childOnly, kind, orderBy, orderDir }),
    placeholderData: keepPreviousData,
  });

  const classes = pageItems(data);

  const handleRowClick = (klass: Class) => {
    openEntity(`classes/${klass.id}/levels`);
  };

  const handleRowMouseEnter = (klass: Class) => {
    void queryClient.prefetchQuery(classDetailQuery(ruleset.id, klass.id));
    // And the Levels tab its page opens on
    void queryClient.prefetchQuery(classLevelsQuery(ruleset.id, klass.id));
  };

  const renderCell = (klass: Class, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return (
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {klass.name}
          </Typography>
        );
      case "hitDie":
        return <ValueChip label={formatDie(klass.hd)} />;
      case "description":
        return <DescriptionCell text={klass.description} />;
      default:
        return null;
    }
  };

  return (
    <SectionContent>
      <Stack spacing={3}>
        <SearchBar
          {...searchBarProps}
          searchPlaceholder="Search classes…"
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
        <Stack spacing={2}>
          <RulesetSectionTable
            what="Classes"
            error={error}
            data={classes}
            animationOffset={itemsBeforeLastPage(data)}
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
        </Stack>
      </Stack>

      <CreateDialog {...createDialogProps} title="Create New Class">
        <ClassFormFields form={createForm} />
      </CreateDialog>
    </SectionContent>
  );
}
