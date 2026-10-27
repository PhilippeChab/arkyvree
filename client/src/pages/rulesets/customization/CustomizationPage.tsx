import { Stack, Typography } from "@mui/material";
import { partialMatchKey, type QueryKey, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { type ReactNode } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import {
  DiceSpinner,
  ReadOnlyFields,
  type SectionTab,
  SectionTabPanel,
  SectionTabs,
} from "@/client/src/components/common/index.ts";
import { TargetPathBreadcrumbs } from "@/client/src/components/customization/index.ts";
import {
  type CustomizationPage,
  useCustomizationPages,
  usePageTitle,
  useRules,
  useRulesetPermissions,
} from "@/client/src/hooks/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { type RulesDescription, type RulesetDetail, rulesetDetailQuery } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import { EntityDetailLayout, EntityPageError } from "@/client/src/pages/rulesets/components/index.ts";
import { entityPageState } from "@/client/src/pages/rulesets/entityPageState.ts";
import {
  useCopyOnWrite,
  useEntityPageBack,
  useFormOptions,
  useRestorableDelete,
} from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { buildCustomizationPath, buildEntityPagePath, hasCustomizationPage } from "@/shared/customization/entities.ts";
import { formatOperator } from "@/shared/customization/operators.ts";

import { modifiersQuery, requirementsQuery } from "./customizationSectionQueries.ts";
import { type EditableEntity, isEditable, renderEditor } from "./editors/index.ts";
import { type CustomizationEntity, customizationEntityQuery, MODIFIER_PAGE } from "./entityQueries.ts";
import {
  type CustomizationSection,
  describeCustomizationTabs,
  ModifiersSection,
  RequirementsSection,
} from "./sections/index.ts";

interface CustomizationViewProps {
  canEdit: boolean;
  data: CustomizationEntity;
  entityId: string;
  /** Still showing the entity a copy was made from, while the copy loads. */
  locked: boolean;
  ruleset: RulesetDetail;
  rulesetId: string;
  section: CustomizationSection;
  tabs: SectionTab<CustomizationSection>[];
}

function CustomizationView({
  rulesetId,
  entityId,
  section,
  tabs,
  ruleset,
  data,
  canEdit,
  locked,
}: CustomizationViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const type = data.type;
  const { rules } = useRules(ruleset.baseRules);
  const pages = useCustomizationPages();
  const label = entityTypeLabel(type, rules?.words);
  const { title, pageTitle, subtitle, backPath } = describe(data, rulesetId, (sourceType, sourceId) =>
    modifierSourcePath(rulesetId, sourceType, sourceId, pages, rules),
  );
  // Where it was opened from, else what holds it (a class's level, an entity's modifier), else its list
  const back = useEntityPageBack(location.state, backPath ?? `/rulesets/${rulesetId}/${type}`, rules?.words);
  usePageTitle(pageTitle);

  const entityKey = QUERY_KEYS.rulesets.entity(rulesetId, type, entityId);
  // An owned entity's owner (a class level's class): its tabs (its levels, its tables, its progression) read what the
  // owned entity's page changes
  const ownerQueryKey = data.holder === "owned" ? QUERY_KEYS.rulesets.ownerDetail(rulesetId, data.ownerId) : undefined;
  const customizedKeys = ownerQueryKey ? [entityKey, ownerQueryKey] : [entityKey];

  // A copy-on-write moves the page to the copy; `copiedFrom` keeps the source on screen while the copy loads
  const copy = useCopyOnWrite(rulesetId, entityId, (id) => buildCustomizationPath(type, id));
  const forgetSource = copy.forgetSource(!locked);
  // What this page deletes, the entity or what it holds, comes back with the entity when it's inherited
  const { restorable, error: changesError } = useRestorableDelete(ruleset, deletedHolder(data));

  // Save responses lack relations (aptitudes, level feats): refetch the entity
  const refetchSaved = (saved: { id: string }) =>
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rulesets.entity(rulesetId, type, saved.id) });

  const sectionProps = {
    ruleset,
    entityId,
    followCopy: copy.followCopy,
    restorable,
  };

  return (
    <EntityDetailLayout
      entityName={`Customize ${title}`}
      rulesetName={ruleset.name}
      what={label}
      subtitle={subtitle}
      backTo={back.to}
      backDisabled={locked}
      deletion={
        canEdit && isEditable(data) && !locked
          ? {
              rulesetId,
              deleteFn: () => deleteEntityFn(data, rulesetId, entityId),
              // An owned entity is listed by its owner alone (a class level by its class's levels): a ruleset has no
              // list of them
              listKeys: [ownerQueryKey ?? QUERY_KEYS.rulesets.section(rulesetId, type)],
              entityKey,
              restorable,
              changesError,
            }
          : undefined
      }
    >
      {forgetSource && <Navigate to={forgetSource.to} replace state={forgetSource.state} />}
      {isEditable(data) && (
        // The same form whoever reads it, its fields read-only for who can't edit the entity
        <ReadOnlyFields readOnly={!canEdit}>
          {renderEditor(data, rules, {
            rulesetId,
            entityId,
            recordKey: copy.key,
            adoptKey: copy.adoptKey,
            locked,
            followCopy: copy.followCopy,
            refetchSaved,
          })}
        </ReadOnlyFields>
      )}
      <Stack spacing={4}>
        <SectionTabs
          tabs={tabs}
          value={section}
          // A tab's rows load as it's pointed at, as a ruleset's tabs do
          onTabHover={(key) => {
            if (key === "requirements" || data.holder === "modifier")
              void queryClient.prefetchQuery(requirementsQuery(rulesetId, type, entityId));
            else void queryClient.prefetchQuery(modifiersQuery(rulesetId, data.type, entityId));
          }}
          // While locked the entry still says where the copy came from: replace it
          // rather than leave more entries to clean up.
          onChange={(key) =>
            navigate(buildEntityPagePath(rulesetId, type, entityId, pages, key), {
              state: location.state,
              replace: locked,
            })
          }
          aria-label="Customization Tabs"
        />

        <SectionTabPanel>
          {/* The source's customizations don't belong to the copy: wait for it. A modifier has its requirements alone */}
          {locked ? (
            <DiceSpinner sx={{ py: 4 }} />
          ) : section === "requirements" || data.holder === "modifier" ? (
            <RequirementsSection {...sectionProps} entityType={type} queryKeysToInvalidate={customizedKeys} />
          ) : (
            <ModifiersSection {...sectionProps} entityType={data.type} queryKeysToInvalidate={customizedKeys} />
          )}
        </SectionTabPanel>
      </Stack>
    </EntityDetailLayout>
  );
}

/**
 * The ruleset entity whose delete the page's comes back with: its own, an owned entity's owner (a class level's class);
 * a modifier's isn't told.
 */
function deletedHolder(data: CustomizationEntity) {
  if (data.holder === "modifier") return undefined;
  return { id: data.holder === "owned" ? data.ownerId : data.entity.id, rulesetId: data.entity.rulesetId };
}

/** What surrounds the editor: the header and where Back goes. */
function describe(
  data: CustomizationEntity,
  rulesetId: string,
  sourcePath: (sourceType: string, sourceId: string) => string | undefined,
): {
  backPath?: string;
  pageTitle: string;
  subtitle?: ReactNode;
  title: string;
} {
  switch (data.holder) {
    case "modifier": {
      const modifier = data.entity;
      return {
        title: modifier.sourceName,
        pageTitle: `${modifier.target} ${formatOperator("modifier", modifier.operator)} ${modifier.value}`,
        subtitle: (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "center" }}>
            <TargetPathBreadcrumbs target={modifier.target} targetLabels={modifier.targetLabels} />
            <Typography component="p" sx={{ typography: { xs: "body1", sm: "h6" }, color: "text.secondary" }}>
              {formatOperator("modifier", modifier.operator)} {modifier.value}
            </Typography>
          </Stack>
        ),
        backPath: sourcePath(modifier.sourceType, modifier.sourceId),
      };
    }
    case "owned":
      return {
        title: `${data.entity.name} Level ${data.entity.position}`,
        pageTitle: `${data.entity.name} Level ${data.entity.position}`,
        // Its owner's page, which opens on its base rules' first tab
        backPath: `/rulesets/${rulesetId}/${data.owner}/${data.ownerId}`,
      };
    default:
      return { title: data.entity.name, pageTitle: data.entity.name };
  }
}

/**
 * Where a modifier's page goes back to: its entity's customization page (`pages`, the kinds whose customizations have
 * one), the Modifiers tab of its own page for a kind of the rules (`rules`) that has none (a class's), or nowhere.
 */
function modifierSourcePath(
  rulesetId: string,
  sourceType: string,
  sourceId: string,
  pages: ReadonlyMap<string, CustomizationPage>,
  rules: RulesDescription | undefined,
) {
  if (hasCustomizationPage(sourceType, pages)) return buildEntityPagePath(rulesetId, sourceType, sourceId, pages);
  if (!rules?.kinds.some((kind) => kind.type === sourceType)) return undefined;
  return buildEntityPagePath(rulesetId, sourceType, sourceId, pages, "modifiers");
}

/** An entity's customization tabs, their help its rules' (`rules`); a modifier can only carry requirements. */
function tabsFor(type: string, rules: RulesDescription | undefined) {
  const tabs = describeCustomizationTabs(rules);
  return type === "modifiers" ? tabs.filter((tab) => tab.key === "requirements") : tabs;
}

async function deleteEntityFn(data: EditableEntity, id: string, entityId: string) {
  const api = rpc.api.rulesets[":id"];
  if (data.holder === "owned") {
    await parseResponse(
      api.entities[":entityType"][":entityId"].owned[":ownedId"].$delete({
        param: {
          id,
          entityType: data.owner,
          entityId: data.ownerId,
          ownedId: entityId,
        },
      }),
    );
    return;
  }
  // A kind's entity, through the routes by kind
  await parseResponse(
    api.entities[":entityType"][":entityId"].$delete({
      param: { id, entityType: data.type, entityId },
    }),
  );
}

export default function CustomizationPage() {
  const {
    id: rulesetId = "",
    entityType,
    entityId = "",
    section,
  } = useParams<{
    entityId: string;
    entityType: string;
    id: string;
    section?: string;
  }>();
  const location = useLocation();
  const pages = useCustomizationPages();
  const page = entityType === "modifiers" ? MODIFIER_PAGE : entityType ? pages.get(entityType) : undefined;
  const validType = page?.type;

  const { copiedFrom } = entityPageState(location.state);

  // Right after a copy-on-write, keep showing the entity the copy was made
  // from until the copy loads, so the page and any unsaved edits stay; the
  // page is locked meanwhile. A refetch of the source may already return the
  // copy, as the server resolves an inherited entity to its copy. The
  // ruleset must match too: an inherited entity keeps its id in every fork.
  function keepCopySource(
    previous: CustomizationEntity | undefined,
    previousQuery: { queryKey: QueryKey } | undefined,
  ) {
    return copiedFrom &&
      previous &&
      !!previousQuery &&
      partialMatchKey(previousQuery.queryKey, QUERY_KEYS.rulesets.detail(rulesetId)) &&
      (previous.entity.id === copiedFrom || previous.entity.id === entityId)
      ? previous
      : undefined;
  }

  const { data: ruleset, isLoading: isRulesetLoading, error: rulesetError } = useQuery(rulesetDetailQuery(rulesetId));
  // Until the entity says what holds it, Back goes where the page was opened from, else to the ruleset
  const { all, rules } = useRules(ruleset?.baseRules);
  const back = useEntityPageBack(location.state, `/rulesets/${rulesetId}`, rules?.words);
  const {
    data,
    isLoading: isEntityLoading,
    isPlaceholderData,
    error: entityError,
  } = useQuery({
    ...customizationEntityQuery(rulesetId, page, entityId),
    placeholderData: keepCopySource,
  });
  // Load the editors' pickers alongside the entity: a kind is one module's, so its fields are known before its ruleset
  const { canEditEntities } = useRulesetPermissions(ruleset);
  const pageRules = Object.values(all ?? {}).find((each) =>
    each.customizationPages.some((it) => it.type === validType),
  );
  useFormOptions(rulesetId, pageRules?.fields[validType ?? ""], canEditEntities);

  const tabs = validType ? tabsFor(validType, rules) : [];
  const currentTab = tabs.find((tab) => tab.key === section)?.key;

  // Normalize the URL to a tab the entity has.
  if (validType && entityId && !currentTab) {
    return (
      <Navigate
        to={buildEntityPagePath(rulesetId, validType, entityId, pages, tabsFor(validType, rules)[0].key)}
        replace
        state={location.state}
      />
    );
  }

  // A failed refetch keeps showing the data it has (and any unsaved edits).
  if (
    !validType ||
    (rulesetError && !ruleset) ||
    (entityError && !data) ||
    (!isRulesetLoading && !isEntityLoading && (!ruleset || !data))
  ) {
    return (
      <EntityPageError
        message={
          !validType
            ? `Invalid entity type: ${entityType}`
            : !ruleset && (rulesetError || !entityError)
              ? loadFailureMessage("Ruleset", rulesetError)
              : loadFailureMessage(entityTypeLabel(validType, rules?.words), entityError)
        }
        backLabel={back.label}
        backTo={back.to}
      />
    );
  }

  if (!ruleset || !data || !currentTab) {
    return (
      <EntityDetailLayout backTo={back.to} what={entityTypeLabel(validType, rules?.words)} isLoading>
        {null}
      </EntityDetailLayout>
    );
  }

  return (
    <CustomizationView
      rulesetId={rulesetId}
      entityId={entityId}
      section={currentTab}
      tabs={tabs}
      ruleset={ruleset}
      data={data}
      canEdit={canEditEntities}
      locked={isPlaceholderData}
    />
  );
}
