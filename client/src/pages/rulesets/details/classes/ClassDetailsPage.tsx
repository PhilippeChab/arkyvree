import { Stack } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import { ReadOnlyFields, SectionTabPanel, SectionTabs } from "@/client/src/components/common/index.ts";
import { usePageTitle, useRulesetPermissions } from "@/client/src/hooks/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { type RulesetDetail, rulesetDetailQuery } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { withEntityFields } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { EntityDetailLayout, EntityPageError } from "@/client/src/pages/rulesets/components/index.ts";
import { entityPageBack } from "@/client/src/pages/rulesets/entityPageState.ts";
import {
  useCopyOnWrite,
  useEntityFields,
  useEntityForm,
  useRestorableDelete,
} from "@/client/src/pages/rulesets/hooks/index.ts";
import { isStillOpen } from "@/client/src/pages/rulesets/stillOpen.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { getClassForms } from "./classFormFactory.ts";
import { getClassSections } from "./classSectionFactory.ts";
import { type ClassDetail, classDetailQuery, type ClassFormData } from "./classSectionQueries.ts";
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

  const { data: classData, isLoading, error } = useQuery(classDetailQuery(rulesetId, classId));

  usePageTitle(classData?.name);

  const classForms = getClassForms(ruleset.baseRules);
  const classSections = getClassSections(ruleset.baseRules);
  // Its base rules' tabs, then its own, then those that customize it
  const tabs = [...classSections.tabs, ...CLASS_TABS, ...CLASS_CUSTOMIZATION_TABS];
  const currentTab = tabs.find((tab) => tab.key === section);
  // An address of a tab it had before opens the one that took its place
  const aliasedTab =
    section !== undefined && Object.hasOwn(classSections.tabAliases, section)
      ? classSections.tabAliases[section]
      : undefined;

  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);
  // Deleting an inherited class, or what it holds, can be undone
  const { restorable, error: changesError } = useRestorableDelete(ruleset, classData);

  const { fields: classFields } = useEntityFields(rulesetId, "klasses");
  // Its base rules' form of the class, with the fields its ruleset declares for classes
  const toClassForm = (klass: Pick<ClassDetail, "description" | "hd" | "name">) =>
    withEntityFields(classForms.toClassForm(klass), classFields, klass);
  const forgetSource = copy.forgetSource(!!classData);

  const { form: editForm, save } = useEntityForm({
    // Its base rules' empty class until the class loads, which its editor never shows
    empty: classForms.emptyClass,
    values: classData && toClassForm(classData),
    formKey: copy.key,
    adoptKey: copy.adoptKey,
    updatedAt: classData?.updatedAt,
    rulesetId,
    entityId: classId,
    label: "Class",
    listKey: QUERY_KEYS.rulesets.section(rulesetId, "classes"),
    saveFn: (data: ClassFormData, updatedAt: string | undefined) =>
      parseResponse(
        rpc.api.rulesets[":id"].classes[":classId"].$put({
          param: { id: rulesetId, classId },
          json: { ...data, updatedAt },
        }),
      ),
    toFormValues: toClassForm,
    storeSaved: (saved, sourceId) => {
      const savedKey = classDetailQuery(rulesetId, saved.id).queryKey;
      // The PUT returns the class row with its fields: keep showing what the class's response adds to it until the
      // refetch brings the saved class's own; unless the page has left that class while the save was in flight
      if (classData && isStillOpen(`/rulesets/${rulesetId}/classes/${sourceId}`))
        queryClient.setQueryData(savedKey, { ...classData, ...saved });
      void queryClient.invalidateQueries({ queryKey: savedKey, exact: true });
    },
    followCopy: copy.followCopy,
  });

  // Normalize the URL to a tab its base rules give: the one an old tab's address names, or its first.
  if (!currentTab) {
    return (
      <Navigate
        to={`/rulesets/${rulesetId}/classes/${classId}/${aliasedTab ?? tabs[0].key}`}
        replace
        state={location.state}
      />
    );
  }

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
            {/* The same form whoever reads it, its fields read-only for who can't edit the class */}
            <ReadOnlyFields readOnly={!canEdit}>
              <ClassDetails rulesetId={rulesetId} edit={{ form: editForm, ...save }} />
            </ReadOnlyFields>
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
  const { data: ruleset, isLoading, error } = useQuery(rulesetDetailQuery(rulesetId));
  const back = entityPageBack(location.state, `/rulesets/${rulesetId}/classes`, ruleset?.baseRules);
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
