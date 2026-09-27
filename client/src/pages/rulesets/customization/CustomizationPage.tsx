import { TargetPathBreadcrumbs } from "@/client/src/components/customization/index.ts";
import { DeleteDialog, FaqHelpIcon, SectionTabs, type SectionTab } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { MODIFIER_OPERATOR_LABELS } from "@/client/src/lib/operatorLabels.ts";
import { rulesetDetailQuery } from "@/client/src/lib/queries.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { EntityDetailLayout } from "@/client/src/pages/rulesets/components/index.ts";
import { useRulesetPermissions } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import {
  Label as PropertiesIcon,
  Rule as RequirementsIcon,
  Settings as ModifiersIcon,
} from "@mui/icons-material";
import { Box, Button, Paper, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ClassLevelEditor, FeatEditor, ItemEditor, RaceEditor, SpellEditor } from "./editors/index.ts";
import { customizationEntityQuery, type CustomizationEntity } from "./entityQueries.ts";
import { ModifiersSection, PropertiesSection, RequirementsSection } from "./sections/index.ts";
import type { EntityType } from "./types.ts";

type Ruleset = InferResponseType<(typeof rpc.api.rulesets)[":id"]["$get"], 200>;

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

const isEntityType = (type: string | undefined): type is EntityType => !!type && type in ENTITY_LABELS;

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

  const { data: ruleset, isLoading: isRulesetLoading, error: rulesetError } = useQuery(rulesetDetailQuery(rulesetId));
  const { data, isLoading: isEntityLoading, error: entityError } = useQuery({
    ...customizationEntityQuery(rulesetId, validType ?? "feats", entityId),
    enabled: !!validType && !!entityId,
  });

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

  if (!validType || rulesetError || entityError || (!isRulesetLoading && !isEntityLoading && (!ruleset || !data))) {
    return (
      <Box sx={{ maxWidth: 1200, margin: "0 auto", p: { xs: 2, sm: 3 } }}>
        <Paper sx={{ p: { xs: 2, sm: 4 }, textAlign: "center" }}>
          <Typography variant="h5" color="error" gutterBottom>
            {validType ? "Failed to load customization data" : `Invalid entity type: ${entityType}`}
          </Typography>
          <Button variant="contained" onClick={() => navigate(`/rulesets/${rulesetId}`)} sx={{ mt: 2 }}>
            Back to Ruleset
          </Button>
        </Paper>
      </Box>
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

// Delete the entity; the endpoint depends on its type.
async function deleteEntity(data: CustomizationEntity, id: string, entityId: string) {
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
      throw new Error(`${ENTITY_LABELS[data.type]} can't be deleted here`);
  }
}

interface CustomizationViewProps {
  rulesetId: string;
  entityId: string;
  section: TabSection;
  tabs: SectionTab<TabSection>[];
  ruleset: Ruleset;
  data: CustomizationEntity;
}

function CustomizationView({ rulesetId, entityId, section, tabs, ruleset, data }: CustomizationViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);

  const type = data.type;
  const label = ENTITY_LABELS[type];
  const { title, pageTitle, subtitle, backPath } = describe(data, rulesetId, entityId);
  const listPath = (location.state as { from?: string } | null)?.from ?? `/rulesets/${rulesetId}/${type}`;
  usePageTitle(pageTitle);

  const entityKey = queryKeys.rulesets.entity(rulesetId, type, entityId);
  const klassLevelsKey = data.type === "klass_levels" ? queryKeys.rulesets.classLevels(rulesetId, data.entity.klassId) : undefined;

  const handleSaved = (savedId: string, listKey: QueryKey, message: string) => {
    // Editing an inherited entity copies it into this ruleset under a new id.
    if (savedId !== entityId) {
      navigate(`/rulesets/${rulesetId}/${type}/${savedId}/customization/${section}`, { replace: true, state: location.state });
    }
    void queryClient.invalidateQueries({ queryKey: listKey });
    snackbar.success(message);
    // Save responses lack relations (aptitudes, level feats): refetch the entity.
    return queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.entity(rulesetId, type, savedId) });
  };

  const deleteMutation = useMutation({
    mutationFn: () => deleteEntity(data, rulesetId, entityId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(rulesetId, type) });
      if (klassLevelsKey) void queryClient.invalidateQueries({ queryKey: klassLevelsKey });
      snackbar.success(`${label} deleted`);
      navigate(backPath ?? listPath);
    },
    onError: (err) => snackbar.error(err, `Failed to delete ${label.toLowerCase()}`),
  });

  const editorProps = { rulesetId, entityId, canEdit, onSaved: handleSaved };
  const canDelete = canEdit && (type === "feats" || type === "races" || type === "items" || type === "powers" || type === "klass_levels");

  // Customizations of an inherited entity copy it; follow the copy.
  const handleEntityIdChange = (newEntityId: string) =>
    navigate(`/rulesets/${rulesetId}/${type}/${newEntityId}/customization/${section}`, { replace: true, state: location.state });

  const sectionProps = { ruleset, entityId, data: undefined, onEntityIdChange: handleEntityIdChange };

  return (
    <EntityDetailLayout
      entityName={`Customize ${title}`}
      subtitle={subtitle ?? `${label} in ${ruleset.name}`}
      onBack={() => navigate(backPath ?? listPath)}
      canDelete={canDelete}
      onDelete={() => setDeleteDialogOpen(true)}
    >
      {data.type === "feats" && <FeatEditor {...editorProps} entity={data.entity} />}
      {data.type === "races" && <RaceEditor {...editorProps} entity={data.entity} />}
      {data.type === "items" && <ItemEditor {...editorProps} entity={data.entity} />}
      {data.type === "powers" && <SpellEditor {...editorProps} entity={data.entity} />}
      {data.type === "klass_levels" && <ClassLevelEditor {...editorProps} entity={data.entity} />}

      <SectionTabs
        tabs={tabs}
        value={section}
        onChange={(key) => navigate(`/rulesets/${rulesetId}/${type}/${entityId}/customization/${key}`)}
        aria-label="customization tabs"
      />

      <Box role="tabpanel" sx={{ py: 3 }}>
        {section === "requirements" ? (
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
