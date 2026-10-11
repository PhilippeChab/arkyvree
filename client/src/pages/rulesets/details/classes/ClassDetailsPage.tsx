import { Stack } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import { SectionTabPanel, SectionTabs } from "@/client/src/components/common/index.ts";
import { useFormSync, useFormWith, usePageTitle, useRulesetPermissions } from "@/client/src/hooks/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { type RulesetDetail, rulesetDetailQuery } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { EntityDetailLayout, EntityPageError } from "@/client/src/pages/rulesets/components/index.ts";
import { entityPageBack } from "@/client/src/pages/rulesets/entityPageState.ts";
import { useCopyOnWrite, useEntitySave, useRestorableDelete } from "@/client/src/pages/rulesets/hooks/index.ts";
import { isStillOpen } from "@/client/src/pages/rulesets/stillOpen.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { getClassForms } from "./classFormFactory.ts";
import { getClassSections } from "./classSectionFactory.ts";
import { classDetailQuery, type ClassFormData } from "./classSectionQueries.ts";
import { CLASS_CUSTOMIZATION_TABS, CLASS_TABS } from "./sections/index.ts";

interface ClassViewProps {
  /** Where Back goes, and its name */
  back: ReturnType<typeof entityPageBack>;
  classId: string;
  /** The class's ruleset, whose base rules its forms, its fields and its tabs are */
  ruleset: RulesetDetail;
  rulesetId: string;
  /** The URL's tab */
  section: string | undefined;
}

/** A class's page once its ruleset is in: its details and their editor, and its tabs, its base rules' among them. */
function ClassView({ back, classId, ruleset, rulesetId, section }: ClassViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  // A save of an inherited class copies it, and the page follows the copy: its details' saves, here (its form's, and
  // what its base rules' card saves in place); its tabs' through theirs (`useClassCopy`)
  const copy = useCopyOnWrite(rulesetId, classId, (id) => `classes/${id}`);

  const { data: classData, isLoading, isFetching, error } = useQuery(classDetailQuery(rulesetId, classId));

  usePageTitle(classData?.name);

  const classForms = getClassForms(ruleset.baseRules);
  const classSections = getClassSections(ruleset.baseRules);
  // Its own tabs, then its base rules', then those that customize it
  const tabs = [...CLASS_TABS, ...classSections.tabs, ...CLASS_CUSTOMIZATION_TABS];
  const currentTab = tabs.find((tab) => tab.key === section);
  // Its base rules' empty class until the class loads, which its editor never shows
  const editForm = useFormWith<ClassFormData>(classForms.emptyClass);

  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);
  // Deleting an inherited class, or what it holds, can be undone
  const { restorable, error: changesError } = useRestorableDelete(ruleset, classData);

  const sync = useFormSync(editForm, classData && classForms.toClassForm(classData), {
    key: copy.key,
    adoptKey: copy.adoptKey,
    updatedAt: classData?.updatedAt,
  });
  const forgetSource = copy.forgetSource(!!classData);

  const updateMutation = useEntitySave({
    rulesetId,
    entityId: classId,
    label: "Class",
    listKey: QUERY_KEYS.rulesets.section(rulesetId, "classes"),
    sync,
    saveFn: (data: ClassFormData, updatedAt: string | undefined) =>
      parseResponse(
        rpc.api.rulesets[":id"].classes[":classId"].$put({
          param: { id: rulesetId, classId },
          json: { ...data, updatedAt },
        }),
      ),
    toFormValues: classForms.toClassForm,
    storeSaved: (saved, sourceId) => {
      const savedKey = classDetailQuery(rulesetId, saved.id).queryKey;
      // The PUT returns the bare class row: keep showing what the class's response adds to it (what its details read of
      // its properties) until the refetch brings the saved class's own, what its card sets in place waiting until then
      // (`isFetching`); unless the page has left that class while the save was in flight
      if (classData && isStillOpen(`/rulesets/${rulesetId}/classes/${sourceId}`))
        queryClient.setQueryData(savedKey, { ...classData, ...saved });
      void queryClient.invalidateQueries({ queryKey: savedKey, exact: true });
    },
    followCopy: copy.followCopy,
  });

  // Normalize the URL to a tab its base rules give.
  if (!currentTab) return <Navigate to={`/rulesets/${rulesetId}/classes/${classId}/levels`} replace />;

  if (!isLoading && !classData)
    return <EntityPageError message={loadFailureMessage("Class", error)} backLabel={back.label} backTo={back.to} />;

  const { Section } = currentTab;
  const { ClassDetails } = classSections;

  return (
    <>
      {forgetSource && <Navigate to={forgetSource.to} replace state={forgetSource.state} />}
      <EntityDetailLayout
        entityName={classData?.name}
        rulesetName={ruleset.name}
        what="Class"
        backTo={back.to}
        deletion={
          canEdit
            ? {
                rulesetId,
                deleteFn: () =>
                  parseResponse(
                    rpc.api.rulesets[":id"].classes[":classId"].$delete({ param: { id: rulesetId, classId } }),
                  ),
                listKeys: [QUERY_KEYS.rulesets.section(rulesetId, "classes")],
                // With its tabs
                entityKey: classDetailQuery(rulesetId, classId).queryKey,
                restorable,
                changesError,
              }
            : undefined
        }
        isLoading={isLoading}
      >
        {classData && (
          <>
            <ClassDetails
              klass={classData}
              classId={classId}
              rulesetId={rulesetId}
              edit={
                canEdit
                  ? {
                      form: editForm,
                      onSubmit: sync.handleSubmit((data) => updateMutation.mutate(data)),
                      canSave: sync.isDirty,
                      isSaving: updateMutation.isPending,
                    }
                  : undefined
              }
              followCopy={copy.followCopy}
              isFetching={isFetching}
            />
            <Stack spacing={4}>
              <SectionTabs
                tabs={tabs}
                value={currentTab.key}
                // Keep the Back target the page was opened with.
                onChange={(key) =>
                  navigate(`/rulesets/${rulesetId}/classes/${classId}/${key}`, { state: location.state })
                }
                onTabHover={(key) =>
                  void tabs.find((tab) => tab.key === key)?.prefetch?.(queryClient, rulesetId, classId)
                }
                aria-label="Class Details Tabs"
              />

              <SectionTabPanel>
                <Section
                  rulesetId={rulesetId}
                  classId={classId}
                  className={classData.name}
                  ruleset={ruleset}
                  restorable={restorable}
                />
              </SectionTabPanel>
            </Stack>
          </>
        )}
      </EntityDetailLayout>
    </>
  );
}

export default function ClassDetailsPage() {
  const location = useLocation();
  const {
    id: rulesetId = "",
    classId = "",
    section,
  } = useParams<{
    classId: string;
    id: string;
    section?: string;
  }>();
  const back = entityPageBack(location.state, `/rulesets/${rulesetId}/classes`);

  const { data: ruleset, isLoading, error } = useQuery(rulesetDetailQuery(rulesetId));
  // The class loads alongside its ruleset, which its page waits for: its forms and its tabs are its base rules'
  useQuery(classDetailQuery(rulesetId, classId));

  if (!ruleset) {
    return isLoading ? (
      <EntityDetailLayout backTo={back.to} what="Class" isLoading>
        {null}
      </EntityDetailLayout>
    ) : (
      <EntityPageError message={loadFailureMessage("Ruleset", error)} backLabel={back.label} backTo={back.to} />
    );
  }

  return <ClassView back={back} classId={classId} ruleset={ruleset} rulesetId={rulesetId} section={section} />;
}
