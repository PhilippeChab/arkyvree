import { Stack, Typography } from "@mui/material";
import { type QueryKey, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { type ReactNode, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import {
  DiceSpinner,
  HelpLabel,
  type SectionTab,
  SectionTabPanel,
  SectionTabs,
} from "@/client/src/components/common/index.ts";
import {
  MODIFIERS_HELP,
  PROPERTIES_HELP,
  REQUIREMENTS_HELP,
  TargetPathBreadcrumbs,
} from "@/client/src/components/customization/index.ts";
import { ModifiersIcon, PropertiesIcon, RequirementsIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { type RulesetDetail, rulesetDetailQuery } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import {
  EntityDeleteDialog,
  EntityDetailLayout,
  EntityPageError,
} from "@/client/src/pages/rulesets/components/index.ts";
import { invalidateRulesetEdit } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { entityPageState } from "@/client/src/pages/rulesets/entityPageState.ts";
import {
  useCopyOnWrite,
  useRestorableDelete,
  useRulesetFeats,
  useRulesetPermissions,
  useRulesetSaves,
} from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import {
  buildCustomizationPath,
  CUSTOMIZATION_PAGE_TYPES,
  type CustomizationPageType,
  parseCustomizationSegment,
} from "@/shared/customization/entities.ts";
import { formatOperator } from "@/shared/customization/operators.ts";
import { isOneOf } from "@/shared/isOneOf.ts";

import {
  ClassLevelEditor,
  type EditorProps,
  FeatEditor,
  ItemEditor,
  RaceEditor,
  SpellEditor,
} from "./editors/index.ts";
import { type CustomizationEntity, customizationEntityQuery } from "./entityQueries.ts";
import { ModifiersSection, PropertiesSection, RequirementsSection } from "./sections/index.ts";

interface CustomizationViewProps {
  canEdit: boolean;
  data: CustomizationEntity;
  entityId: string;
  /** Still showing the entity a copy was made from, while the copy loads. */
  locked: boolean;
  ruleset: RulesetDetail;
  rulesetId: string;
  section: TabSection;
  tabs: SectionTab<TabSection>[];
}

type EditableEntity = Extract<CustomizationEntity, { type: (typeof EDITABLE_TYPES)[number] }>;

type TabSection = "properties" | "modifiers" | "requirements";

/** Entities with an editor on this page, which can also be deleted from it. */
const EDITABLE_TYPES = ["feats", "races", "items", "powers", "klass_levels"] as const;

const TABS: SectionTab<TabSection>[] = [
  {
    key: "properties",
    icon: PropertiesIcon,
    label: <HelpLabel label="Properties" help={PROPERTIES_HELP} />,
  },
  {
    key: "modifiers",
    icon: ModifiersIcon,
    label: <HelpLabel label="Modifiers" help={MODIFIERS_HELP} />,
  },
  {
    key: "requirements",
    icon: RequirementsIcon,
    label: <HelpLabel label="Requirements" help={REQUIREMENTS_HELP} />,
  },
];

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
  const snackbar = useSnackbar();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const type = data.type;
  const label = entityTypeLabel(type, ruleset.baseRules);
  const { title, pageTitle, subtitle, backPath } = describe(data, rulesetId);
  const state = entityPageState(location.state);
  const listPath = state.from ?? `/rulesets/${rulesetId}/${type}`;
  usePageTitle(pageTitle);

  const entityKey = QUERY_KEYS.rulesets.entity(rulesetId, type, entityId);
  const klassLevelsKey =
    data.type === "klass_levels" ? QUERY_KEYS.rulesets.classLevels(rulesetId, data.entity.klassId) : undefined;

  // A copy-on-write moves the page to the copy; `copiedFrom` keeps the source on screen while the copy loads
  const copy = useCopyOnWrite(rulesetId, entityId, (id) => buildCustomizationPath(type, id));
  const forgetSource = copy.forgetSource(!locked);
  // What this page deletes, the entity or what it holds, comes back with the entity when it's inherited
  const { restorable, error: changesError } = useRestorableDelete(ruleset, deletedHolder(data));

  const handleSaved = (sourceId: string, saved: { id: string }, listKey: QueryKey, message: string) => {
    copy.followCopy(saved.id, sourceId);
    invalidateRulesetEdit(queryClient, rulesetId, [listKey]);
    snackbar.success(message);
    // Save responses lack relations (aptitudes, level feats): refetch the entity.
    return queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rulesets.entity(rulesetId, type, saved.id) });
  };

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!isEditable(data)) throw new Error(`${label} can't be deleted here`);
      return deleteEntityFn(data, rulesetId, entityId);
    },
    onSuccess: () => {
      invalidateRulesetEdit(queryClient, rulesetId, [
        QUERY_KEYS.rulesets.section(rulesetId, type),
        ...(klassLevelsKey ? [klassLevelsKey] : []),
      ]);
      snackbar.success(`${label} deleted`);
      navigate(backPath ?? listPath);
      // Gone: don't let Back render it from the cache.
      queryClient.removeQueries({ queryKey: entityKey });
    },
    onError: (error) => snackbar.error(error, `Failed to delete ${label.toLowerCase()}`),
  });

  const sectionProps = {
    ruleset,
    entityId,
    data: undefined,
    onEntityIdChange: copy.followCopy,
    restorable,
  };

  return (
    <EntityDetailLayout
      entityName={`Customize ${title}`}
      subtitle={subtitle ?? `${label} in ${ruleset.name}`}
      backTo={backPath ?? listPath}
      backDisabled={locked}
      canDelete={canEdit && isEditable(data) && !locked}
      onDelete={() => setDeleteDialogOpen(true)}
      restorable={restorable}
    >
      {forgetSource && <Navigate to={forgetSource.to} replace state={forgetSource.state} />}
      {isEditable(data) &&
        renderEditor(data, {
          rulesetId,
          entityId,
          recordKey: copy.key,
          adoptKey: copy.adoptKey,
          canEdit,
          locked,
          onSaved: handleSaved,
        })}
      <Stack spacing={4}>
        <SectionTabs
          tabs={tabs}
          value={section}
          // While locked the entry still says where the copy came from: replace it
          // rather than leave more entries to clean up.
          onChange={(key) =>
            navigate(`/rulesets/${rulesetId}/${buildCustomizationPath(type, entityId)}/${key}`, {
              state: location.state,
              replace: locked,
            })
          }
          aria-label="Customization Tabs"
        />

        <SectionTabPanel>
          {/* The source's customizations don't belong to the copy: wait for it. */}
          {locked ? (
            <DiceSpinner sx={{ py: 4 }} />
          ) : section === "requirements" ? (
            <RequirementsSection {...sectionProps} entityType={type} queryKeysToInvalidate={[entityKey]} />
          ) : data.type === "modifiers" ? null : section === "modifiers" ? (
            <ModifiersSection {...sectionProps} entityType={data.type} queryKeysToInvalidate={[entityKey]} />
          ) : (
            <PropertiesSection
              {...sectionProps}
              entityType={data.type}
              data={"properties" in data.entity ? data.entity.properties : undefined}
              queryKeysToInvalidate={klassLevelsKey ? [entityKey, klassLevelsKey] : [entityKey]}
            />
          )}
        </SectionTabPanel>
      </Stack>

      <EntityDeleteDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        what={label}
        restorable={restorable}
        changesError={changesError}
        onConfirm={() => deleteMutation.mutate()}
        isLoading={deleteMutation.isPending}
      />
    </EntityDetailLayout>
  );
}

/** The ruleset entity whose delete the page's comes back with: its own, a class level's class; a modifier's isn't told. */
function deletedHolder(data: CustomizationEntity) {
  if (data.type === "modifiers") return undefined;
  return { id: data.type === "klass_levels" ? data.entity.klassId : data.entity.id, rulesetId: data.entity.rulesetId };
}

/** What surrounds the editor: the header and where Back goes. */
function describe(
  data: CustomizationEntity,
  rulesetId: string,
): {
  backPath?: string;
  pageTitle: string;
  subtitle?: ReactNode;
  title: string;
} {
  switch (data.type) {
    case "modifiers": {
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
        backPath: modifierSourcePath(rulesetId, modifier.sourceType, modifier.sourceId),
      };
    }
    case "klass_levels":
      return {
        title: `${data.entity.name} Level ${data.entity.level}`,
        pageTitle: `${data.entity.name} Level ${data.entity.level}`,
        backPath: `/rulesets/${rulesetId}/classes/${data.entity.klassId}/levels`,
      };
    default:
      return { title: data.entity.name, pageTitle: data.entity.name };
  }
}

function isEditable(data: CustomizationEntity): data is EditableEntity {
  return EDITABLE_TYPES.some((type) => type === data.type);
}

/** Where a modifier's page goes back to: its class's Modifiers tab, or its entity's customization page. */
function modifierSourcePath(rulesetId: string, sourceType: string, sourceId: string) {
  if (sourceType === "klasses") return `/rulesets/${rulesetId}/classes/${sourceId}/modifiers`;
  const path = isOneOf(sourceType, CUSTOMIZATION_PAGE_TYPES)
    ? buildCustomizationPath(sourceType, sourceId)
    : `${sourceType}/${sourceId}/customization`;
  return `/rulesets/${rulesetId}/${path}`;
}

function renderEditor(data: EditableEntity, props: Omit<EditorProps<unknown>, "entity">) {
  switch (data.type) {
    case "feats":
      return <FeatEditor {...props} entity={data.entity} />;
    case "races":
      return <RaceEditor {...props} entity={data.entity} />;
    case "items":
      return <ItemEditor {...props} entity={data.entity} />;
    case "powers":
      return <SpellEditor {...props} entity={data.entity} />;
    case "klass_levels":
      return <ClassLevelEditor {...props} entity={data.entity} />;
    default:
      return data satisfies never;
  }
}

/** A modifier can only carry requirements. */
function tabsFor(type: CustomizationPageType) {
  return type === "modifiers" ? TABS.filter((tab) => tab.key === "requirements") : TABS;
}

async function deleteEntityFn(data: EditableEntity, id: string, entityId: string) {
  const api = rpc.api.rulesets[":id"];
  switch (data.type) {
    case "feats":
      await parseResponse(api.feats[":featId"].$delete({ param: { id, featId: entityId } }));
      return;
    case "races":
      await parseResponse(api.races[":raceId"].$delete({ param: { id, raceId: entityId } }));
      return;
    case "items":
      await parseResponse(api.items[":itemId"].$delete({ param: { id, itemId: entityId } }));
      return;
    case "powers":
      await parseResponse(api.powers[":powerId"].$delete({ param: { id, powerId: entityId } }));
      return;
    case "klass_levels":
      await parseResponse(
        api.classes[":classId"].levels[":levelId"].$delete({
          param: { id, classId: data.entity.klassId, levelId: entityId },
        }),
      );
      return;
    default:
      return data satisfies never;
  }
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
  const validType = parseCustomizationSegment(entityType);

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
      previousQuery?.queryKey[2] === rulesetId &&
      (previous.entity.id === copiedFrom || previous.entity.id === entityId)
      ? previous
      : undefined;
  }

  const { data: ruleset, isLoading: isRulesetLoading, error: rulesetError } = useQuery(rulesetDetailQuery(rulesetId));
  const {
    data,
    isLoading: isEntityLoading,
    isPlaceholderData,
    error: entityError,
  } = useQuery({
    ...customizationEntityQuery(rulesetId, validType, entityId),
    placeholderData: keepCopySource,
  });
  // Load the editors' pickers alongside the entity.
  const { canEditEntities } = useRulesetPermissions(ruleset);
  useRulesetSaves(rulesetId, validType === "powers" || validType === "klass_levels");
  useRulesetFeats(rulesetId, "", validType === "klass_levels" && canEditEntities);

  const tabs = validType ? tabsFor(validType) : [];
  const currentTab = tabs.find((tab) => tab.key === section)?.key;

  // Normalize the URL to a tab the entity has.
  if (validType && entityId && !currentTab) {
    return (
      <Navigate
        to={`/rulesets/${rulesetId}/${buildCustomizationPath(validType, entityId)}/${tabsFor(validType)[0].key}`}
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
              : loadFailureMessage(entityTypeLabel(validType, ruleset?.baseRules), entityError)
        }
        backLabel="Back to Ruleset"
        backTo={`/rulesets/${rulesetId}`}
      />
    );
  }

  if (!ruleset || !data || !currentTab) {
    return (
      <EntityDetailLayout backTo={`/rulesets/${rulesetId}`} canDelete={false} isLoading>
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
