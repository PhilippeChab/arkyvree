import { Box, Stack, Typography } from "@mui/material";
import { type QueryKey, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import {
  DeleteDialog,
  DiceSpinner,
  HelpLabel,
  type SectionTab,
  SectionTabs,
} from "@/client/src/components/common/index.ts";
import { TargetPathBreadcrumbs } from "@/client/src/components/customization/index.ts";
import { ModifiersIcon, PropertiesIcon, RequirementsIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { usePageTitle, useRulesetFeats, useRulesetSaves } from "@/client/src/hooks/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { MODIFIER_OPERATOR_LABELS } from "@/client/src/lib/operatorLabels.ts";
import { type RulesetDetail, rulesetDetailQuery } from "@/client/src/lib/queries.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import { isStillOpen } from "@/client/src/lib/stillOpen.ts";
import { EntityDetailLayout, EntityPageError } from "@/client/src/pages/rulesets/components/index.ts";
import {
  ClassLevelEditor,
  type EditorProps,
  FeatEditor,
  ItemEditor,
  RaceEditor,
  SpellEditor,
} from "@/client/src/pages/rulesets/customization/editors/index.ts";
import {
  type CustomizationEntity,
  customizationEntityQuery,
} from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import {
  ModifiersSection,
  PropertiesSection,
  RequirementsSection,
} from "@/client/src/pages/rulesets/customization/sections/index.ts";
import { entityPageState, useRulesetPermissions } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import {
  buildCustomizationPath,
  CUSTOMIZATION_PAGE_TYPES,
  type CustomizationPageType,
  parseCustomizationSegment,
} from "@/shared/customization/entities.ts";
import { isOneOf } from "@/shared/isOneOf.ts";

type TabSection = "properties" | "modifiers" | "requirements";

type EditableEntity = Extract<CustomizationEntity, { type: (typeof EDITABLE_TYPES)[number] }>;

interface CustomizationViewProps {
  rulesetId: string;
  entityId: string;
  section: TabSection;
  tabs: SectionTab<TabSection>[];
  ruleset: RulesetDetail;
  data: CustomizationEntity;
  canEdit: boolean;
  /** Still showing the entity a copy was made from, while the copy loads. */
  locked: boolean;
}

/** Entities with an editor on this page, which can also be deleted from it. */
const EDITABLE_TYPES = ["feats", "races", "items", "powers", "klass_levels"] as const;

const TABS: SectionTab<TabSection>[] = [
  {
    key: "properties",
    icon: PropertiesIcon,
    label: (
      <HelpLabel
        label="Properties"
        help="Properties are additional attributes that can be applied to entities, providing extra characteristics or metadata."
      />
    ),
  },
  {
    key: "modifiers",
    icon: ModifiersIcon,
    label: (
      <HelpLabel
        label="Modifiers"
        help="Modifiers affect character attributes with operations like add, subtract, multiply. They can modify things like strength, AC, skills, etc."
      />
    ),
  },
  {
    key: "requirements",
    icon: RequirementsIcon,
    label: (
      <HelpLabel
        label="Requirements"
        help="Requirements are conditions that entities must meet to be usable/available. Examples include character level requirements, feat prerequisites, etc."
      />
    ),
  },
];

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

/** What surrounds the editor: the header and where Back goes. */
function describe(
  data: CustomizationEntity,
  rulesetId: string,
): {
  title: string;
  pageTitle: string;
  subtitle?: ReactNode;
  backPath?: string;
} {
  switch (data.type) {
    case "modifiers": {
      const modifier = data.entity;
      return {
        title: modifier.sourceName,
        pageTitle: `${modifier.target} ${modifier.operator} ${modifier.value}`,
        subtitle: (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "center" }}>
            <TargetPathBreadcrumbs target={modifier.target} targetLabels={modifier.targetLabels} />
            <Typography component="p" sx={{ typography: { xs: "body1", sm: "h6" }, color: "text.secondary" }}>
              {MODIFIER_OPERATOR_LABELS[modifier.operator]} {modifier.value}
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

async function deleteEntity(data: EditableEntity, id: string, entityId: string) {
  const api = rpc.api.rulesets[":id"];
  switch (data.type) {
    case "feats":
      await api.feats[":featId"].$delete({ param: { id, featId: entityId } });
      return;
    case "races":
      await api.races[":raceId"].$delete({ param: { id, raceId: entityId } });
      return;
    case "items":
      await api.items[":itemId"].$delete({ param: { id, itemId: entityId } });
      return;
    case "powers":
      await api.powers[":powerId"].$delete({ param: { id, powerId: entityId } });
      return;
    case "klass_levels":
      await api.classes[":classId"].levels[":levelId"].$delete({
        param: { id, classId: data.entity.klassId, levelId: entityId },
      });
      return;
    default:
      return data satisfies never;
  }
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
  const snackbar = useSnackbar();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const type = data.type;
  const label = entityTypeLabel(type, ruleset.baseRules);
  const { title, pageTitle, subtitle, backPath } = describe(data, rulesetId);
  const state = entityPageState(location.state);
  const listPath = state.from ?? `/rulesets/${rulesetId}/${type}`;
  usePageTitle(pageTitle);

  const entityKey = queryKeys.rulesets.entity(rulesetId, type, entityId);
  const klassLevelsKey =
    data.type === "klass_levels" ? queryKeys.rulesets.classLevels(rulesetId, data.entity.klassId) : undefined;

  // Editing or customizing an inherited entity copies it into this ruleset
  // under a new id: move to the copy, unless the page has left the source
  // since. `copiedFrom` keeps the source on screen while the copy loads and
  // lets the editor carry its unsaved edits over.
  const followCopy = (copyId: string, sourceId: string) => {
    const sourcePath = `/rulesets/${rulesetId}/${buildCustomizationPath(type, sourceId)}`;
    if (!isStillOpen(sourcePath)) return;
    // Onto the tab shown now, which may have changed while the request ran.
    navigate(
      `/rulesets/${rulesetId}/${buildCustomizationPath(type, copyId)}${window.location.pathname.slice(sourcePath.length)}`,
      {
        replace: true,
        state: { ...state, copiedFrom: sourceId },
      },
    );
  };

  // Once the copy's own data is in, forget where it came from, so going back and forth in history never carries edits
  // between the two. A navigation still loading has moved the address bar on: leave it be.
  const { copiedFrom, ...stateAfterCopy } = state;
  const forgetsCopy = !!copiedFrom && !locked && window.location.pathname === location.pathname;

  const handleSaved = (sourceId: string, saved: { id: string }, listKey: QueryKey, message: string) => {
    if (saved.id !== sourceId) followCopy(saved.id, sourceId);
    void queryClient.invalidateQueries({ queryKey: listKey });
    snackbar.success(message);
    // Save responses lack relations (aptitudes, level feats): refetch the entity.
    return queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.entity(rulesetId, type, saved.id) });
  };

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!isEditable(data)) throw new Error(`${label} can't be deleted here`);
      return deleteEntity(data, rulesetId, entityId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(rulesetId, type) });
      if (klassLevelsKey) void queryClient.invalidateQueries({ queryKey: klassLevelsKey });
      snackbar.success(`${label} deleted`);
      navigate(backPath ?? listPath);
      // Gone: don't let Back render it from the cache.
      queryClient.removeQueries({ queryKey: entityKey });
    },
    onError: (err) => snackbar.error(err, `Failed to delete ${label.toLowerCase()}`),
  });

  const sectionProps = {
    ruleset,
    entityId,
    data: undefined,
    onEntityIdChange: followCopy,
  };

  return (
    <EntityDetailLayout
      entityName={`Customize ${title}`}
      subtitle={subtitle ?? `${label} in ${ruleset.name}`}
      backTo={backPath ?? listPath}
      backDisabled={locked}
      canDelete={canEdit && isEditable(data) && !locked}
      onDelete={() => setDeleteDialogOpen(true)}
    >
      {forgetsCopy && (
        <Navigate to={`${location.pathname}${location.search}${location.hash}`} replace state={stateAfterCopy} />
      )}
      {isEditable(data) &&
        renderEditor(data, {
          rulesetId,
          entityId,
          recordKey: `${rulesetId}/${entityId}`,
          adoptKey: state.copiedFrom && `${rulesetId}/${state.copiedFrom}`,
          canEdit,
          locked,
          onSaved: handleSaved,
        })}

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
        aria-label="customization tabs"
      />

      <Box role="tabpanel" sx={{ py: 3 }}>
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
      </Box>

      <DeleteDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        title={`Delete ${label}`}
        message={`Are you sure you want to delete this ${label.toLowerCase()}? This action cannot be undone.`}
        onConfirm={() => deleteMutation.mutate()}
        isLoading={deleteMutation.isPending}
      />
    </EntityDetailLayout>
  );
}

export default function CustomizationPage() {
  const {
    id: rulesetId = "",
    entityType,
    entityId = "",
    section,
  } = useParams<{
    id: string;
    entityType: string;
    entityId: string;
    section?: string;
  }>();
  const location = useLocation();
  const validType = parseCustomizationSegment(entityType);

  const { copiedFrom } = entityPageState(location.state);

  const { data: ruleset, isLoading: isRulesetLoading, error: rulesetError } = useQuery(rulesetDetailQuery(rulesetId));
  const {
    data,
    isLoading: isEntityLoading,
    isPlaceholderData,
    error: entityError,
  } = useQuery({
    ...customizationEntityQuery(rulesetId, validType ?? "feats", entityId),
    enabled: !!validType && !!entityId,
    // Right after a copy-on-write, keep showing the entity the copy was made
    // from until the copy loads, so the page and any unsaved edits stay; the
    // page is locked meanwhile. A refetch of the source may already return the
    // copy, as the server resolves an inherited entity to its copy. The
    // ruleset must match too: an inherited entity keeps its id in every fork.
    placeholderData: (previous, previousQuery) =>
      copiedFrom &&
      previous &&
      previousQuery?.queryKey[2] === rulesetId &&
      (previous.entity.id === copiedFrom || previous.entity.id === entityId)
        ? previous
        : undefined,
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

  // A type no entity has is an address the app doesn't know, which the routes send on
  if (!validType) return <Navigate to={`/rulesets/${rulesetId}`} replace />;

  // A failed refetch keeps showing the data it has (and any unsaved edits).
  if (
    (rulesetError && !ruleset) ||
    (entityError && !data) ||
    (!isRulesetLoading && !isEntityLoading && (!ruleset || !data))
  ) {
    return (
      <EntityPageError
        message={
          !ruleset && (rulesetError || !entityError)
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
