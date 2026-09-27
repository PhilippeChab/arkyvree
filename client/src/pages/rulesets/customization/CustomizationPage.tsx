import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { TargetPathBreadcrumbs } from "@/client/src/components/customization/index.ts";
import { DeleteDialog, DiceSpinner, FaqHelpIcon, SectionTabs, type SectionTab } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { usePageTitle, useRulesetFeats, useRulesetSaves } from "@/client/src/hooks/index.ts";
import { MODIFIER_OPERATOR_LABELS } from "@/client/src/lib/operatorLabels.ts";
import { rulesetDetailQuery, type RulesetDetail } from "@/client/src/lib/queries.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { isStillOpen } from "@/client/src/lib/stillOpen.ts";
import { EntityDetailLayout, EntityPageError } from "@/client/src/pages/rulesets/components/index.ts";
import {
  ClassLevelEditor,
  FeatEditor,
  ItemEditor,
  RaceEditor,
  SpellEditor,
  type EditorProps,
} from "@/client/src/pages/rulesets/customization/editors/index.ts";
import {
  customizationEntityQuery,
  type CustomizationEntity,
} from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { useRulesetPermissions, entityPageState } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import {
  Label as PropertiesIcon,
  Rule as RequirementsIcon,
  Settings as ModifiersIcon,
} from "@mui/icons-material";
import { Box, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ModifiersSection,
  PropertiesSection,
  RequirementsSection,
} from "@/client/src/pages/rulesets/customization/sections/index.ts";
import type { EntityType } from "@/client/src/pages/rulesets/customization/types.ts";

type TabSection = "properties" | "modifiers" | "requirements";

const tabLabel = (label: string, help: string) => (
  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
    {label}
    <FaqHelpIcon text={help} />
  </Box>
);

const TABS: SectionTab<TabSection>[] = [
  {
    key: "properties",
    icon: PropertiesIcon,
    label: tabLabel("Properties", "Properties are additional attributes that can be applied to entities, providing extra characteristics or metadata."),
  },
  {
    key: "modifiers",
    icon: ModifiersIcon,
    label: tabLabel("Modifiers", "Modifiers affect character attributes with operations like add, subtract, multiply. They can modify things like strength, AC, skills, etc."),
  },
  {
    key: "requirements",
    icon: RequirementsIcon,
    label: tabLabel("Requirements", "Requirements are conditions that entities must meet to be usable/available. Examples include character level requirements, feat prerequisites, etc."),
  },
];

// A modifier can only carry requirements.
const tabsFor = (type: EntityType) => (type === "modifiers" ? TABS.filter((tab) => tab.key === "requirements") : TABS);

const ENTITY_LABELS: Record<EntityType, string> = {
  feats: "Feat",
  klass_levels: "Class Level",
  klasses: "Class",
  items: "Item",
  powers: "Power",
  races: "Race",
  modifiers: "Modifier",
};

const isEntityType = (type: string | undefined): type is EntityType => !!type && Object.hasOwn(ENTITY_LABELS, type);

// Entities with an editor on this page, which can also be deleted from it.
const EDITABLE_TYPES = ["feats", "races", "items", "powers", "klass_levels"] as const;
type EditableEntity = Extract<CustomizationEntity, { type: (typeof EDITABLE_TYPES)[number] }>;
const isEditable = (data: CustomizationEntity): data is EditableEntity =>
  EDITABLE_TYPES.some((type) => type === data.type);

export default function CustomizationPage() {
  const { id: rulesetId = "", entityType, entityId = "", section } = useParams<{
    id: string;
    entityType: string;
    entityId: string;
    section?: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const validType = isEntityType(entityType) ? entityType : undefined;

  const { copiedFrom } = entityPageState(location.state);

  const { data: ruleset, isLoading: isRulesetLoading, error: rulesetError } = useQuery(rulesetDetailQuery(rulesetId));
  const { data, isLoading: isEntityLoading, isPlaceholderData, error: entityError } = useQuery({
    ...customizationEntityQuery(rulesetId, validType ?? "feats", entityId),
    enabled: !!validType && !!entityId,
    // Right after a copy-on-write, keep showing the entity the copy was made
    // from until the copy loads, so the page and any unsaved edits stay; the
    // page is locked meanwhile. A refetch of the source may already return the
    // copy, as the server resolves an inherited entity to its copy. The
    // ruleset must match too: an inherited entity keeps its id in every fork.
    placeholderData: (previous, previousQuery) =>
      copiedFrom && previous && previousQuery?.queryKey[2] === rulesetId
        && (previous.entity.id === copiedFrom || previous.entity.id === entityId)
        ? previous
        : undefined,
  });
  // Load the editors' pickers alongside the entity.
  const { canEditEntities } = useRulesetPermissions(ruleset);
  useRulesetSaves(rulesetId, validType === "powers" || validType === "klass_levels");
  useRulesetFeats(rulesetId, validType === "klass_levels" && canEditEntities);

  const tabs = validType ? tabsFor(validType) : [];
  const currentTab = tabs.find((tab) => tab.key === section)?.key;

  // Normalize the URL to a tab the entity has.
  useEffect(() => {
    if (validType && entityId && !currentTab) {
      navigate(`/rulesets/${rulesetId}/${validType}/${entityId}/customization/${tabsFor(validType)[0].key}`, {
        replace: true,
        state: location.state,
      });
    }
  }, [rulesetId, validType, entityId, currentTab, navigate, location.state]);

  // A failed refetch keeps showing the data it has (and any unsaved edits).
  if (!validType || (rulesetError && !ruleset) || (entityError && !data) || (!isRulesetLoading && !isEntityLoading && (!ruleset || !data))) {
    return (
      <EntityPageError
        message={!validType
          ? `Invalid entity type: ${entityType}`
          : !ruleset && (rulesetError || !entityError)
            ? loadFailureMessage("Ruleset", rulesetError)
            : loadFailureMessage(ENTITY_LABELS[validType], entityError)}
        backLabel="Back to Ruleset"
        onBack={() => navigate(`/rulesets/${rulesetId}`)}
      />
    );
  }

  if (!ruleset || !data || !currentTab) {
    return <EntityDetailLayout onBack={() => navigate(-1)} canDelete={false} isLoading>{null}</EntityDetailLayout>;
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

/** What surrounds the editor: the header and where Back goes. */
function describe(data: CustomizationEntity, rulesetId: string, entityId: string): {
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
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1 }}>
            <TargetPathBreadcrumbs target={modifier.target} targetLabels={modifier.targetLabels} />
            <Typography sx={{ typography: { xs: "body1", sm: "h6" }, color: "text.secondary" }}>
              {MODIFIER_OPERATOR_LABELS[modifier.operator]} {modifier.value}
            </Typography>
          </Box>
        ),
        backPath: `/rulesets/${rulesetId}/${modifier.sourceType}/${modifier.sourceId}/customization`,
      };
    }
    case "klass_levels":
      return {
        title: `${data.entity.name} Level ${data.entity.level}`,
        pageTitle: `${data.entity.name} Level ${data.entity.level}`,
        backPath: `/rulesets/${rulesetId}/classes/${data.entity.klassId}/levels`,
      };
    case "klasses":
      return { title: data.entity.name, pageTitle: data.entity.name, backPath: `/rulesets/${rulesetId}/classes/${entityId}` };
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
      await api.classes[":classId"].levels[":levelId"].$delete({ param: { id, classId: data.entity.klassId, levelId: entityId } });
      return;
    default:
      return data satisfies never;
  }
}

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

function CustomizationView({ rulesetId, entityId, section, tabs, ruleset, data, canEdit, locked }: CustomizationViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const type = data.type;
  const label = ENTITY_LABELS[type];
  const { title, pageTitle, subtitle, backPath } = describe(data, rulesetId, entityId);
  const state = entityPageState(location.state);
  const listPath = state.from ?? `/rulesets/${rulesetId}/${type}`;
  usePageTitle(pageTitle);

  const entityKey = queryKeys.rulesets.entity(rulesetId, type, entityId);
  const klassLevelsKey = data.type === "klass_levels" ? queryKeys.rulesets.classLevels(rulesetId, data.entity.klassId) : undefined;

  // Editing or customizing an inherited entity copies it into this ruleset
  // under a new id: move to the copy, unless the page has left the source
  // since. `copiedFrom` keeps the source on screen while the copy loads and
  // lets the editor carry its unsaved edits over.
  const followCopy = (copyId: string, sourceId: string) => {
    const sourcePath = `/rulesets/${rulesetId}/${type}/${sourceId}`;
    if (!isStillOpen(sourcePath)) return;
    // Onto the tab shown now, which may have changed while the request ran.
    navigate(`/rulesets/${rulesetId}/${type}/${copyId}${window.location.pathname.slice(sourcePath.length)}`, {
      replace: true,
      state: { ...state, copiedFrom: sourceId },
    });
  };

  // Once the copy's own data is in, forget where it came from, so going
  // back and forth in history never carries edits between the two.
  useEffect(() => {
    const current = entityPageState(location.state);
    if (!current.copiedFrom || locked) return;
    // A navigation still loading has moved the address bar on: leave it be.
    if (window.location.pathname !== location.pathname) return;
    const { copiedFrom: _done, ...rest } = current;
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: rest });
  }, [location.state, locked, location.pathname, location.search, location.hash, navigate]);

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
      onBack={() => navigate(backPath ?? listPath)}
      backDisabled={locked}
      canDelete={canEdit && isEditable(data) && !locked}
      onDelete={() => setDeleteDialogOpen(true)}
    >
      {isEditable(data) && renderEditor(data, {
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
        onChange={(key) => navigate(`/rulesets/${rulesetId}/${type}/${entityId}/customization/${key}`, {
          state: location.state,
          replace: locked,
        })}
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
