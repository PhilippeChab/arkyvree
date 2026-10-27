import { Stack } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import { ConfirmDialog, ReadOnlyFields, SectionTabPanel, SectionTabs } from "@/client/src/components/common/index.ts";
import { useLeaveGuard, usePageTitle, useRules, useRulesetPermissions } from "@/client/src/hooks/index.ts";
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
  useEntityFields,
  useEntityForm,
  useEntityPageBack,
  useRestorableDelete,
} from "@/client/src/pages/rulesets/hooks/index.ts";
import { isStillOpen } from "@/client/src/pages/rulesets/stillOpen.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useOwnerDraftsStore } from "@/client/src/stores/ownerDraftsStore.ts";

import { OwnerDetails } from "./components/index.ts";
import { type OwnerDetail, ownerDetailQuery } from "./ownerSectionQueries.ts";
import { getOwnerTabAlias, getOwnerTabs } from "./ownerTabs.ts";

interface OwnerViewProps {
  /** Where Back goes, and its name */
  back: ReturnType<typeof useEntityPageBack>;
  ownerId: string;
  /** Its kind (3.5's `classes`), whose routes, fields and words its page reads */
  ownerType: string;
  /** The owner's ruleset, whose base rules its forms, its fields and its tabs are */
  ruleset: RulesetDetail;
  rulesetId: string;
  /** The URL's tab */
  section: string | undefined;
  /** Its kind's word ("Class") */
  word: string;
}

/** What a progression owner's page takes: its kind (3.5's `classes`), and its kind's module's rules. */
interface ProgressionOwnerPageProps {
  /** Its kind (3.5's `classes`), whose routes, fields and words its page reads */
  ownerType: string;
  /** Its kind's module's rules, which its words are */
  rules: RulesDescription;
}

/**
 * A progression owner's page once its ruleset is in: its details and their editor, and its tabs, its base rules' among
 * them.
 */
function OwnerView({ back, ownerId, ownerType, ruleset, rulesetId, section, word }: OwnerViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  // A save of an inherited owner copies it, and the page follows the copy: its details' saves, here (its form's, and
  // what its base rules' card saves in place); its tabs' through theirs (`useOwnerCopy`)
  const copy = useCopyOnWrite(rulesetId, ownerId, (id) => `${ownerType}/${id}`);

  const { data: ownerData, isLoading, error } = useQuery(ownerDetailQuery(rulesetId, ownerType, ownerId));

  // Its tabs' unsaved edits: a reload asks first, and so does leaving the owner's page (its tabs are the page, and so
  // is the copy a save of it follows), which discards them
  const unsaved = useOwnerDraftsStore(
    (state) => state.ownerId === ownerId && Object.values(state.drafts).some((draft) => draft.changed),
  );
  const discardDrafts = useOwnerDraftsStore((state) => state.discard);
  const ownerPath = `/rulesets/${rulesetId}/${ownerType}/${ownerId}`;
  const leave = useLeaveGuard(
    unsaved,
    (next) =>
      next.pathname === ownerPath ||
      next.pathname.startsWith(`${ownerPath}/`) ||
      entityPageState(next.state).copiedFrom === ownerId,
  );

  usePageTitle(ownerData?.name);

  const { rules } = useRules(ruleset.baseRules);
  const tabs = getOwnerTabs(rules);
  const currentTab = tabs.find((tab) => tab.key === section);
  // An address of a tab it had before opens the one that took its place
  const aliasedTab = getOwnerTabAlias(rules, section);

  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);
  // Deleting an inherited owner, or what it holds, can be undone
  const { restorable, error: changesError } = useRestorableDelete(ruleset, ownerData);

  const { fields: ownerFields } = useEntityFields(rulesetId, ownerType);
  // Its form of the owner: its fields as its rules describe them for its kind
  const toOwnerForm = (entity: OwnerDetail) =>
    withEntityFields(toEntityForm<EntityFormData>(ownerFields ?? [], entity), ownerFields, entity);
  const forgetSource = copy.forgetSource(!!ownerData);

  const { form: editForm, save } = useEntityForm({
    // Its rules' empty owner until the owner loads, which its editor never shows
    empty: toEntityForm<EntityFormData>(ownerFields ?? []),
    values: ownerData && toOwnerForm(ownerData),
    formKey: copy.key,
    adoptKey: copy.adoptKey,
    updatedAt: ownerData?.updatedAt,
    rulesetId,
    entityId: ownerId,
    label: word,
    listKey: QUERY_KEYS.rulesets.section(rulesetId, ownerType),
    saveFn: (data: EntityFormData, updatedAt: string | undefined) =>
      parseResponse(
        rpc.api.rulesets[":id"].entities[":entityType"][":entityId"].$put({
          param: { id: rulesetId, entityType: ownerType, entityId: ownerId },
          json: { ...toEntityBody<EntityFormData, EntityFormData>(ownerFields ?? [], data), updatedAt },
        }),
      ),
    toFormValues: toOwnerForm,
    storeSaved: (saved, sourceId) => {
      const savedKey = ownerDetailQuery(rulesetId, ownerType, saved.id).queryKey;
      // The PUT returns the owner row with its fields: keep showing what the owner's response adds to it until the
      // refetch brings the saved owner's own; unless the page has left that owner while the save was in flight
      if (ownerData && isStillOpen(`/rulesets/${rulesetId}/${ownerType}/${sourceId}`))
        queryClient.setQueryData(savedKey, { ...ownerData, ...saved });
      void queryClient.invalidateQueries({ queryKey: savedKey, exact: true });
    },
    followCopy: copy.followCopy,
  });

  // Normalize the URL to a tab its rules give: the one an old tab's address names, or its first.
  if (!currentTab) return <Navigate to={`${ownerPath}/${aliasedTab ?? tabs[0].key}`} replace state={location.state} />;

  if (!isLoading && !ownerData)
    return <EntityPageError message={loadFailureMessage(word, error)} backLabel={back.label} backTo={back.to} />;

  const { Section } = currentTab;

  return (
    <>
      {forgetSource && <Navigate to={forgetSource.to} replace state={forgetSource.state} />}
      <EntityDetailLayout
        entityName={ownerData?.name}
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
                      param: { id: rulesetId, entityType: ownerType, entityId: ownerId },
                    }),
                  ),
                listKeys: [QUERY_KEYS.rulesets.section(rulesetId, ownerType)],
                // With its tabs
                entityKey: ownerDetailQuery(rulesetId, ownerType, ownerId).queryKey,
                restorable,
                changesError,
              }
            : undefined
        }
        isLoading={isLoading}
      >
        {ownerData && (
          <>
            {/* The same form whoever reads it, its fields read-only for who can't edit the owner */}
            <ReadOnlyFields readOnly={!canEdit}>
              <OwnerDetails
                ownerType={ownerType}
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
                onChange={(key) => navigate(`${ownerPath}/${key}`, { state: location.state })}
                onTabHover={(key) =>
                  void tabs.find((tab) => tab.key === key)?.prefetch?.(queryClient, rulesetId, ownerId)
                }
                aria-label={`${word} Details Tabs`}
              />

              <SectionTabPanel>
                <Section
                  rulesetId={rulesetId}
                  ownerId={ownerId}
                  ownerName={ownerData.name}
                  ownerType={ownerType}
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
 * The page of an entity of a kind whose row opens its progression (`ownerType`: 3.5's classes), by its kind's URL
 * segment (`KindEntityPage`'s): it waits for its ruleset, reading the owner meanwhile.
 */
export default function ProgressionOwnerPage({ ownerType, rules: kindRules }: ProgressionOwnerPageProps) {
  const location = useLocation();
  const {
    id: rulesetId = "",
    entityId: ownerId = "",
    tab: section,
  } = useParams<{
    entityId: string;
    id: string;
    tab?: string;
  }>();
  const word = entityTypeLabel(ownerType, kindRules.words);
  const { data: ruleset, isLoading, error } = useQuery(rulesetDetailQuery(rulesetId));
  const { rules } = useRules(ruleset?.baseRules);
  const back = useEntityPageBack(location.state, `/rulesets/${rulesetId}/${ownerType}`, rules?.words);
  // The owner loads alongside its ruleset, which its page waits for: its forms and its tabs are its base rules'
  useQuery(ownerDetailQuery(rulesetId, ownerType, ownerId));

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
    <OwnerView
      back={back}
      ownerId={ownerId}
      ownerType={ownerType}
      ruleset={ruleset}
      rulesetId={rulesetId}
      section={section}
      word={word}
    />
  );
}
