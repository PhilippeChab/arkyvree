import { Stack } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import { ConfirmDialog, ReadOnlyFields, SectionTabPanel, SectionTabs } from "@/client/src/components/common/index.ts";
import { useLeaveGuard, usePageTitle, useRules, useRulesetPermissions } from "@/client/src/hooks/index.ts";
import { entitySegment } from "@/client/src/lib/entityRequests.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { type RulesDescription, type RulesetDetail, rulesetDetailQuery } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import {
  type EntityFormData,
  toEntityBody,
  toEntityForm,
  withEntityFields,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { EntityDetailLayout, EntityPageError } from "@/client/src/pages/rulesets/components/index.ts";
import { entityPageState } from "@/client/src/pages/rulesets/entityPageState.ts";
import {
  useCopyOnWrite,
  useEntityColumns,
  useEntityFields,
  useEntityForm,
  useEntityPageBack,
  useRestorableDelete,
} from "@/client/src/pages/rulesets/hooks/index.ts";
import { isStillOpen } from "@/client/src/pages/rulesets/stillOpen.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useClassDraftsStore } from "@/client/src/stores/classDraftsStore.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

import { type ClassDetail, classDetailQuery } from "./classSectionQueries.ts";
import { getClassTabAlias, getClassTabs } from "./classTabs.ts";
import { ClassDetails } from "./components/index.ts";

/** What a class's page takes: its kind (3.5's `klasses`), and its kind's module's rules. */
interface ClassDetailsPageProps {
  /** Its kind (3.5's `klasses`), whose routes, columns and words its page reads */
  classType: string;
  /** Its kind's module's rules, which its words are */
  rules: RulesDescription;
}

interface ClassViewProps {
  /** Where Back goes, and its name */
  back: ReturnType<typeof useEntityPageBack>;
  classId: string;
  /** Its kind (3.5's `klasses`), whose routes, columns and words its page reads */
  classType: string;
  /** The class's ruleset, whose base rules its forms, its fields and its tabs are */
  ruleset: RulesetDetail;
  rulesetId: string;
  /** The URL's tab */
  section: string | undefined;
  /** Its kind's word ("Class") */
  word: string;
}

/** A class's page once its ruleset is in: its details and their editor, and its tabs, its base rules' among them. */
function ClassView({ back, classId, classType, ruleset, rulesetId, section, word }: ClassViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  // A save of an inherited class copies it, and the page follows the copy: its details' saves, here (its form's, and
  // what its base rules' card saves in place); its tabs' through theirs (`useClassCopy`)
  const segment = getUrlSegment(classType);
  const copy = useCopyOnWrite(rulesetId, classId, (id) => `${segment}/${id}`);

  const { data: classData, isLoading, error } = useQuery(classDetailQuery(rulesetId, classType, classId));

  // Its tabs' unsaved edits: a reload asks first, and so does leaving the class's page (its tabs are the page, and so
  // is the copy a save of it follows), which discards them
  const unsaved = useClassDraftsStore(
    (state) => state.classId === classId && Object.values(state.drafts).some((draft) => draft.changed),
  );
  const discardDrafts = useClassDraftsStore((state) => state.discard);
  const classPath = `/rulesets/${rulesetId}/${segment}/${classId}`;
  const leave = useLeaveGuard(
    unsaved,
    (next) =>
      next.pathname === classPath ||
      next.pathname.startsWith(`${classPath}/`) ||
      entityPageState(next.state).copiedFrom === classId,
  );

  usePageTitle(classData?.name);

  const { rules } = useRules(ruleset.baseRules);
  const tabs = getClassTabs(rules);
  const currentTab = tabs.find((tab) => tab.key === section);
  // An address of a tab it had before opens the one that took its place
  const aliasedTab = getClassTabAlias(rules, section);

  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);
  // Deleting an inherited class, or what it holds, can be undone
  const { restorable, error: changesError } = useRestorableDelete(ruleset, classData);

  const { fields: classFields } = useEntityFields(rulesetId, classType);
  const { columns: classColumns } = useEntityColumns(rulesetId, classType);
  // Its form of the class: its columns as its rules describe them, and the fields its ruleset declares for its kind
  const toClassForm = (entity: ClassDetail) =>
    withEntityFields(toEntityForm<EntityFormData>(classColumns, entity), classFields, entity);
  const forgetSource = copy.forgetSource(!!classData);

  const { form: editForm, save } = useEntityForm({
    // Its rules' empty class until the class loads, which its editor never shows
    empty: toEntityForm<EntityFormData>(classColumns),
    values: classData && toClassForm(classData),
    formKey: copy.key,
    adoptKey: copy.adoptKey,
    updatedAt: classData?.updatedAt,
    rulesetId,
    entityId: classId,
    label: word,
    listKey: QUERY_KEYS.rulesets.section(rulesetId, segment),
    saveFn: (data: EntityFormData, updatedAt: string | undefined) =>
      parseResponse(
        rpc.api.rulesets[":id"].entities[":entityType"][":entityId"].$put({
          param: { id: rulesetId, entityType: entitySegment(segment), entityId: classId },
          json: { ...toEntityBody<EntityFormData, EntityFormData>(classColumns, data), updatedAt },
        }),
      ),
    toFormValues: toClassForm,
    storeSaved: (saved, sourceId) => {
      const savedKey = classDetailQuery(rulesetId, classType, saved.id).queryKey;
      // The PUT returns the class row with its fields: keep showing what the class's response adds to it until the
      // refetch brings the saved class's own; unless the page has left that class while the save was in flight
      if (classData && isStillOpen(`/rulesets/${rulesetId}/${segment}/${sourceId}`))
        queryClient.setQueryData(savedKey, { ...classData, ...saved });
      void queryClient.invalidateQueries({ queryKey: savedKey, exact: true });
    },
    followCopy: copy.followCopy,
  });

  // Normalize the URL to a tab its rules give: the one an old tab's address names, or its first.
  if (!currentTab) return <Navigate to={`${classPath}/${aliasedTab ?? tabs[0].key}`} replace state={location.state} />;

  if (!isLoading && !classData)
    return <EntityPageError message={loadFailureMessage(word, error)} backLabel={back.label} backTo={back.to} />;

  const { Section } = currentTab;

  return (
    <>
      {forgetSource && <Navigate to={forgetSource.to} replace state={forgetSource.state} />}
      <EntityDetailLayout
        entityName={classData?.name}
        rulesetName={ruleset.name}
        what={word}
        backTo={back.to}
        deletion={
          canEdit
            ? {
                rulesetId,
                deleteFn: () =>
                  parseResponse(
                    rpc.api.rulesets[":id"].entities[":entityType"][":entityId"].$delete({
                      param: { id: rulesetId, entityType: entitySegment(segment), entityId: classId },
                    }),
                  ),
                listKeys: [QUERY_KEYS.rulesets.section(rulesetId, segment)],
                // With its tabs
                entityKey: classDetailQuery(rulesetId, classType, classId).queryKey,
                restorable,
                changesError,
              }
            : undefined
        }
        isLoading={isLoading}
      >
        {classData && (
          <>
            {/* The same form whoever reads it, its fields read-only for who can't edit the class */}
            <ReadOnlyFields readOnly={!canEdit}>
              <ClassDetails
                classType={classType}
                rulesetId={rulesetId}
                edit={{ form: editForm, ...save }}
                word={word}
              />
            </ReadOnlyFields>
            <Stack spacing={4}>
              <SectionTabs
                tabs={tabs}
                value={currentTab.key}
                // Keep the Back target the page was opened with.
                onChange={(key) => navigate(`${classPath}/${key}`, { state: location.state })}
                onTabHover={(key) =>
                  void tabs.find((tab) => tab.key === key)?.prefetch?.(queryClient, rulesetId, classId)
                }
                aria-label={`${word} Details Tabs`}
              />

              <SectionTabPanel>
                <Section
                  rulesetId={rulesetId}
                  classId={classId}
                  className={classData.name}
                  classType={classType}
                  ruleset={ruleset}
                  restorable={restorable}
                />
              </SectionTabPanel>
            </Stack>
          </>
        )}
      </EntityDetailLayout>
      <ConfirmDialog
        open={leave.blocked}
        onClose={leave.stay}
        onConfirm={() => {
          discardDrafts();
          leave.proceed();
        }}
        pending={false}
        title="Discard Changes"
        message={`Are you sure you want to leave this ${word.toLowerCase()}? The changes you haven't saved on its tabs are lost.`}
        confirmLabel="Discard Changes"
        intent="destructive"
      />
    </>
  );
}

/**
 * The page of an entity of a kind whose row opens its progression (`classType`: 3.5's classes), by its kind's URL
 * segment (`KindEntityPage`'s): it waits for its ruleset, reading the class meanwhile.
 */
export default function ClassDetailsPage({ classType, rules: kindRules }: ClassDetailsPageProps) {
  const location = useLocation();
  const {
    id: rulesetId = "",
    entityId: classId = "",
    tab: section,
  } = useParams<{
    entityId: string;
    id: string;
    tab?: string;
  }>();
  const word = entityTypeLabel(classType, kindRules.words);
  const { data: ruleset, isLoading, error } = useQuery(rulesetDetailQuery(rulesetId));
  const { rules } = useRules(ruleset?.baseRules);
  const back = useEntityPageBack(location.state, `/rulesets/${rulesetId}/${getUrlSegment(classType)}`, rules?.words);
  // The class loads alongside its ruleset, which its page waits for: its forms and its tabs are its base rules'
  useQuery(classDetailQuery(rulesetId, classType, classId));

  if (!ruleset) {
    return isLoading ? (
      <EntityDetailLayout backTo={back.to} what={word} isLoading>
        {null}
      </EntityDetailLayout>
    ) : (
      <EntityPageError message={loadFailureMessage("Ruleset", error)} backLabel={back.label} backTo={back.to} />
    );
  }

  return (
    <ClassView
      back={back}
      classId={classId}
      classType={classType}
      ruleset={ruleset}
      rulesetId={rulesetId}
      section={section}
      word={word}
    />
  );
}
