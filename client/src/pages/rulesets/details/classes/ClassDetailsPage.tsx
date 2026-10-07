import { Box, Chip, MenuItem, Stack, TextField } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import { DeleteDialog, type SectionTab, SectionTabs } from "@/client/src/components/common/index.ts";
import {
  FeatPoolsIcon,
  ModifiersIcon,
  PropertiesIcon,
  RequirementsIcon,
  SkillsIcon,
  SpellListIcon,
  SpellsIcon,
  TrendingUpIcon,
} from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormSync, useFormWith, usePageTitle, useRulesetAbilities } from "@/client/src/hooks/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { rulesetDetailQuery } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { isStillOpen } from "@/client/src/lib/stillOpen.ts";
import {
  type ClassFormData,
  ClassFormFields,
  EMPTY_CLASS,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import {
  EntityDetailLayout,
  EntityDetailsCard,
  EntityPageError,
} from "@/client/src/pages/rulesets/components/index.ts";
import { propertiesQuery } from "@/client/src/pages/rulesets/customization/customizationQueries.ts";
import { useCopyFollow } from "@/client/src/pages/rulesets/customization/sections/index.ts";
import { invalidateRulesetEdit } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { entityPageState, useRulesetPermissions } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { HIT_DIE_VALUES } from "@/shared/dnd3.5/classes.ts";
import { KLASS_BONUS_SPELL_ABILITY_ID, KLASS_CASTER_TYPE } from "@/shared/dnd3.5/properties/index.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

import { type ClassDetail, classDetailQuery, type ClassSection, prefetchClassSection } from "./classSectionQueries.ts";
import {
  ClassFeatPoolsSection,
  ClassLevelsSection,
  ClassModifiersSection,
  ClassPropertiesSection,
  ClassRequirementsSection,
  ClassSkillsSection,
  ClassSpellListSection,
  ClassSpellsKnownSection,
  ClassSpellsSection,
  useFollowClassCopy,
} from "./sections/index.ts";

const SECTION_COMPONENTS = {
  levels: ClassLevelsSection,
  skills: ClassSkillsSection,
  "feat-pools": ClassFeatPoolsSection,
  "spells-known": ClassSpellsKnownSection,
  spells: ClassSpellsSection,
  "spell-list": ClassSpellListSection,
  properties: ClassPropertiesSection,
  modifiers: ClassModifiersSection,
  requirements: ClassRequirementsSection,
} as const;

const TABS: SectionTab<ClassSection>[] = [
  { key: "levels", label: "Levels", icon: TrendingUpIcon },
  { key: "skills", label: "Skills", icon: SkillsIcon },
  { key: "feat-pools", label: "Feat Pools", icon: FeatPoolsIcon },
  { key: "spells-known", label: "Spells Known", icon: SpellsIcon },
  { key: "spells", label: "Spell Uses", icon: SpellsIcon },
  { key: "spell-list", label: "Spells", icon: SpellListIcon },
  { key: "properties", label: "Properties", icon: PropertiesIcon },
  { key: "modifiers", label: "Modifiers", icon: ModifiersIcon },
  { key: "requirements", label: "Requirements", icon: RequirementsIcon },
];

function isClassSection(section: string | undefined): section is ClassSection {
  return TABS.some((tab) => tab.key === section);
}

function toClassForm(klass: Pick<ClassDetail, "name" | "description" | "hd">): ClassFormData {
  return {
    name: klass.name,
    description: klass.description ?? "",
    hd: oneOf(klass.hd, HIT_DIE_VALUES, 8),
  };
}

export default function ClassDetailsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const {
    id: rulesetId = "",
    classId = "",
    section,
  } = useParams<{
    classId: string;
    id: string;
    section?: string;
  }>();
  const backUrl = entityPageState(location.state).from ?? `/rulesets/${rulesetId}/classes`;
  const currentTab: ClassSection = isClassSection(section) ? section : "levels";
  // The bonus spell and caster type selects write the class's properties: a copy they make is followed, as its
  // Properties tab's saves are
  const followClassCopy = useFollowClassCopy(rulesetId, currentTab);
  const { tag, follow } = useCopyFollow(classId, followClassCopy);

  const { data: ruleset, isLoading: isRulesetLoading, error: rulesetError } = useQuery(rulesetDetailQuery(rulesetId));

  const {
    data: classData,
    isLoading: isClassLoading,
    isFetching: isClassFetching,
    error: classError,
  } = useQuery(classDetailQuery(rulesetId, classId));

  usePageTitle(classData?.name);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const editForm = useFormWith<ClassFormData>(EMPTY_CLASS);

  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);

  const sync = useFormSync(editForm, classData && toClassForm(classData), {
    // An inherited class keeps its id in every fork.
    key: `${rulesetId}/${classId}`,
    updatedAt: classData?.updatedAt,
  });

  const { data: abilities, error: abilitiesError } = useRulesetAbilities(rulesetId);

  const updateMutation = useMutation({
    mutationFn: async (data: ClassFormData) => ({
      sourceId: classId,
      saved: await parseResponse(
        rpc.api.rulesets[":id"].classes[":classId"].$put({
          param: { id: rulesetId, classId },
          json: { ...data, updatedAt: sync.updatedAt() },
        }),
      ),
    }),
    onSuccess: ({ saved: data, sourceId }) => {
      // The page may have left that class while the save was in flight.
      const stillOpen = isStillOpen(`/rulesets/${rulesetId}/classes/${sourceId}`);
      sync.saved(toClassForm(data), data.updatedAt);
      const savedKey = classDetailQuery(rulesetId, data.id).queryKey;
      // The PUT returns the bare class row: keep showing the property fields
      // (bonus spell ability, caster type) until the refetch brings the saved
      // class's own; their selects stay disabled until then.
      if (classData && stillOpen) queryClient.setQueryData(savedKey, { ...classData, ...data });
      queryClient.invalidateQueries({ queryKey: savedKey, exact: true });
      // Editing an inherited class copies it into this ruleset under a new id.
      if (stillOpen && data.id !== sourceId)
        navigate(`/rulesets/${rulesetId}/classes/${data.id}/${currentTab}`, { replace: true, state: location.state });

      invalidateRulesetEdit(queryClient, rulesetId, [QUERY_KEYS.rulesets.section(rulesetId, "classes")]);
      snackbar.success("Class updated");
    },
    onError: (err) => snackbar.error(err, "Failed to update class"),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      parseResponse(rpc.api.rulesets[":id"].classes[":classId"].$delete({ param: { id: rulesetId, classId } })),
    onSuccess: () => {
      invalidateRulesetEdit(queryClient, rulesetId, [QUERY_KEYS.rulesets.section(rulesetId, "classes")]);
      snackbar.success("Class deleted");
      navigate(backUrl);
      // Gone, with its tabs: don't let Back render them from the cache
      queryClient.removeQueries({ queryKey: classDetailQuery(rulesetId, classId).queryKey });
    },
    onError: (err) => snackbar.error(err, "Failed to delete class"),
  });

  // Create, update or clear (empty value) the class's single property of a type, as the Properties tab would: tagged
  // with the class it was sent for, so a copy it makes of an inherited class is followed.
  const setPropertyFn = (type: string, propertyId: string | null | undefined, value: string) => {
    const param = { id: rulesetId, entityType: getUrlSegment("klasses"), entityId: classData?.id ?? classId };
    const endpoint = rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].properties;
    if (!propertyId) return tag(parseResponse(endpoint.$post({ param, json: { type, value } })));
    if (!value) return tag(parseResponse(endpoint[":propertyId"].$delete({ param: { ...param, propertyId } })));
    return tag(parseResponse(endpoint[":propertyId"].$put({ param: { ...param, propertyId }, json: { type, value } })));
  };

  // What the Properties tab's own saves refresh: its list, the class (whose fields read the properties) and Local Changes
  const handleClassPropertySaved =
    (message: string) => (saved: { resolvedEntityId?: string; sourceEntityId: string }) => {
      invalidateRulesetEdit(queryClient, rulesetId, [
        propertiesQuery(rulesetId, "klasses", classId).queryKey,
        classDetailQuery(rulesetId, classId).queryKey,
      ]);
      follow(saved);
      snackbar.success(message);
    };

  const bonusSpellMutation = useMutation({
    mutationFn: (abilityId: string) =>
      setPropertyFn(KLASS_BONUS_SPELL_ABILITY_ID, classData?.bonusSpellPropertyId, abilityId),
    onSuccess: handleClassPropertySaved("Bonus spell ability updated"),
    onError: (err) => snackbar.error(err, "Failed to update bonus spell ability"),
  });

  const casterTypeMutation = useMutation({
    mutationFn: (casterType: string) => setPropertyFn(KLASS_CASTER_TYPE, classData?.casterTypePropertyId, casterType),
    onSuccess: handleClassPropertySaved("Caster type updated"),
    onError: (err) => snackbar.error(err, "Failed to update caster type"),
  });

  // Normalize the URL to a known tab.
  if (rulesetId && classId && !isClassSection(section))
    return <Navigate to={`/rulesets/${rulesetId}/classes/${classId}/levels`} replace />;

  const isLoading = isRulesetLoading || isClassLoading;

  if (!isLoading && (!ruleset || !classData)) {
    return (
      <EntityPageError
        message={!ruleset ? loadFailureMessage("Ruleset", rulesetError) : loadFailureMessage("Class", classError)}
        backLabel="Back"
        backTo={backUrl}
      />
    );
  }

  const Section = SECTION_COMPONENTS[currentTab];
  const bonusSpellAbility = abilities?.find((a) => a.id === classData?.bonusSpellAbilityId);

  return (
    <>
      <EntityDetailLayout
        entityName={classData?.name}
        rulesetName={ruleset?.name}
        backTo={backUrl}
        canDelete={canEdit}
        onDelete={() => setDeleteDialogOpen(true)}
        isLoading={isLoading}
      >
        {classData && ruleset && (
          <>
            <EntityDetailsCard
              title="Class Overview"
              description={classData.description}
              chips={
                <>
                  <Chip label={`Hit Die: d${classData.hd || 8}`} color="secondary" sx={{ fontWeight: 600 }} />
                  {bonusSpellAbility && (
                    <Chip label={`Bonus Spells: ${bonusSpellAbility.name}`} color="info" variant="outlined" />
                  )}
                  {classData.casterTypeValue && (
                    <Chip label={`Caster Type: ${classData.casterTypeValue}`} color="info" variant="outlined" />
                  )}
                </>
              }
              edit={
                canEdit
                  ? {
                      fields: (
                        <>
                          <ClassFormFields form={editForm} />
                          <TextField
                            label="Spellcasting Ability"
                            fullWidth
                            select
                            // Empty until the abilities load: a value with no option is out of range.
                            value={bonusSpellAbility?.id ?? ""}
                            onChange={(e) => bonusSpellMutation.mutate(e.target.value)}
                            disabled={!abilities || bonusSpellMutation.isPending || isClassFetching}
                            error={!!abilitiesError && !abilities}
                            helperText={
                              !abilities && abilitiesError ? loadFailureMessage("Abilities", abilitiesError) : undefined
                            }
                          >
                            <MenuItem value="">None</MenuItem>
                            {abilities?.map((a) => (
                              <MenuItem key={a.id} value={a.id}>
                                {a.name}
                              </MenuItem>
                            ))}
                          </TextField>
                          <TextField
                            label="Caster Type"
                            fullWidth
                            select
                            value={classData.casterTypeValue ?? ""}
                            onChange={(e) => casterTypeMutation.mutate(e.target.value)}
                            disabled={casterTypeMutation.isPending || isClassFetching}
                            helperText="Whether this class casts arcane or divine spells"
                          >
                            <MenuItem value="">None</MenuItem>
                            <MenuItem value="Arcane">Arcane</MenuItem>
                            <MenuItem value="Divine">Divine</MenuItem>
                          </TextField>
                        </>
                      ),
                      onSubmit: sync.handleSubmit((data) => updateMutation.mutate(data)),
                      canSave: editForm.formState.isDirty,
                      isSaving: updateMutation.isPending,
                    }
                  : undefined
              }
            />
            <Stack spacing={4}>
              <SectionTabs
                tabs={TABS}
                value={currentTab}
                // Keep the Back target the page was opened with.
                onChange={(key) =>
                  navigate(`/rulesets/${rulesetId}/classes/${classId}/${key}`, { state: location.state })
                }
                onTabHover={(key) => void prefetchClassSection(queryClient, rulesetId, classId, key)}
                aria-label="Class Details Tabs"
              />

              <Box role="tabpanel">
                <Section rulesetId={rulesetId} classId={classId} className={classData.name} ruleset={ruleset} />
              </Box>
            </Stack>
          </>
        )}
      </EntityDetailLayout>
      <DeleteDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        title="Delete Class"
        message="Are you sure you want to delete this class? This action cannot be undone."
        onConfirm={() => deleteMutation.mutate()}
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}
