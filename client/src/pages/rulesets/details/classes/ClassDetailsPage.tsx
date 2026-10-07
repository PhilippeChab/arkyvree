import { MenuItem, Stack, TextField } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import {
  HelpLabel,
  type SectionTab,
  SectionTabPanel,
  SectionTabs,
  ValueChip,
} from "@/client/src/components/common/index.ts";
import { MODIFIERS_HELP, PROPERTIES_HELP, REQUIREMENTS_HELP } from "@/client/src/components/customization/index.ts";
import {
  FeatPoolsIcon,
  ModifiersIcon,
  PowersIcon,
  PropertiesIcon,
  RequirementsIcon,
  SkillsIcon,
  SpellsIcon,
  SpellUsesIcon,
  TrendingUpIcon,
} from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormSync, useFormWith, usePageTitle, useRulesetAbilities } from "@/client/src/hooks/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { rulesetDetailQuery } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import {
  type ClassFormData,
  ClassFormFields,
  EMPTY_CLASS,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import {
  EntityDeleteDialog,
  EntityDetailLayout,
  EntityDetailsCard,
  EntityPageError,
} from "@/client/src/pages/rulesets/components/index.ts";
import { propertiesQuery } from "@/client/src/pages/rulesets/customization/customizationSectionQueries.ts";
import { useCopyFollow } from "@/client/src/pages/rulesets/customization/sections/index.ts";
import { invalidateRulesetEdit } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { entityPageBack } from "@/client/src/pages/rulesets/entityPageState.ts";
import { useCopyOnWrite, useRestorableDelete, useRulesetPermissions } from "@/client/src/pages/rulesets/hooks/index.ts";
import { isStillOpen } from "@/client/src/pages/rulesets/stillOpen.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { HIT_DIE_VALUES } from "@/shared/dnd3.5/classes.ts";
import { KLASS_BONUS_SPELL_ABILITY_ID, KLASS_CASTER_TYPE } from "@/shared/dnd3.5/properties/index.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

import { type ClassDetail, classDetailQuery, type ClassSection, prefetchClassSection } from "./classSectionQueries.ts";
import { CLASS_SECTIONS } from "./sections/index.ts";

const TABS: SectionTab<ClassSection>[] = [
  { key: "levels", label: "Levels", icon: TrendingUpIcon },
  { key: "skills", label: "Skills", icon: SkillsIcon },
  { key: "feat-pools", label: "Feat Pools", icon: FeatPoolsIcon },
  { key: "spells-known", label: "Spells Known", icon: SpellsIcon },
  { key: "spells", label: "Spell Uses", icon: SpellUsesIcon },
  { key: "spell-list", label: "Spells", icon: PowersIcon },
  { key: "properties", label: <HelpLabel label="Properties" help={PROPERTIES_HELP} />, icon: PropertiesIcon },
  { key: "modifiers", label: <HelpLabel label="Modifiers" help={MODIFIERS_HELP} />, icon: ModifiersIcon },
  { key: "requirements", label: <HelpLabel label="Requirements" help={REQUIREMENTS_HELP} />, icon: RequirementsIcon },
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
  const back = entityPageBack(location.state, `/rulesets/${rulesetId}/classes`);
  const currentTab: ClassSection = isClassSection(section) ? section : "levels";
  // A save of an inherited class copies it: the page follows the copy, as its customization tabs' saves do, and so do
  // the bonus spell and caster type selects, which write the class's properties
  const copy = useCopyOnWrite(rulesetId, classId, (id) => `classes/${id}`);
  const { tag, follow } = useCopyFollow(classId, copy.followCopy);

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
  // Deleting an inherited class, or what it holds, can be undone
  const { restorable, error: changesError } = useRestorableDelete(ruleset, classData);

  const sync = useFormSync(editForm, classData && toClassForm(classData), {
    key: copy.key,
    adoptKey: copy.adoptKey,
    updatedAt: classData?.updatedAt,
  });
  const forgetSource = copy.forgetSource(!!classData);

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
      copy.followCopy(data.id, sourceId);

      invalidateRulesetEdit(queryClient, rulesetId, [QUERY_KEYS.rulesets.section(rulesetId, "classes")]);
      snackbar.success("Class updated");
    },
    onError: (error) => snackbar.error(error, "Failed to update class"),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      parseResponse(rpc.api.rulesets[":id"].classes[":classId"].$delete({ param: { id: rulesetId, classId } })),
    onSuccess: () => {
      invalidateRulesetEdit(queryClient, rulesetId, [QUERY_KEYS.rulesets.section(rulesetId, "classes")]);
      snackbar.success("Class deleted");
      navigate(back.to);
      // Gone, with its tabs: don't let Back render them from the cache
      queryClient.removeQueries({ queryKey: classDetailQuery(rulesetId, classId).queryKey });
    },
    onError: (error) => snackbar.error(error, "Failed to delete class"),
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
        // A copy takes the class's place in the list
        QUERY_KEYS.rulesets.section(rulesetId, "classes"),
      ]);
      follow(saved);
      snackbar.success(message);
    };

  const bonusSpellMutation = useMutation({
    mutationFn: (abilityId: string) =>
      setPropertyFn(KLASS_BONUS_SPELL_ABILITY_ID, classData?.bonusSpellPropertyId, abilityId),
    onSuccess: handleClassPropertySaved("Bonus spell ability updated"),
    onError: (error) => snackbar.error(error, "Failed to update bonus spell ability"),
  });

  const casterTypeMutation = useMutation({
    mutationFn: (casterType: string) => setPropertyFn(KLASS_CASTER_TYPE, classData?.casterTypePropertyId, casterType),
    onSuccess: handleClassPropertySaved("Caster type updated"),
    onError: (error) => snackbar.error(error, "Failed to update caster type"),
  });

  // Normalize the URL to a known tab.
  if (rulesetId && classId && !isClassSection(section))
    return <Navigate to={`/rulesets/${rulesetId}/classes/${classId}/levels`} replace />;

  const isLoading = isRulesetLoading || isClassLoading;

  if (!isLoading && (!ruleset || !classData)) {
    return (
      <EntityPageError
        message={!ruleset ? loadFailureMessage("Ruleset", rulesetError) : loadFailureMessage("Class", classError)}
        backLabel={back.label}
        backTo={back.to}
      />
    );
  }

  const Section = CLASS_SECTIONS[currentTab];
  const bonusSpellAbility = abilities?.find((a) => a.id === classData?.bonusSpellAbilityId);

  return (
    <>
      {forgetSource && <Navigate to={forgetSource.to} replace state={forgetSource.state} />}
      <EntityDetailLayout
        entityName={classData?.name}
        rulesetName={ruleset?.name}
        backTo={back.to}
        canDelete={canEdit}
        onDelete={() => setDeleteDialogOpen(true)}
        restorable={restorable}
        isLoading={isLoading}
      >
        {classData && ruleset && (
          <>
            <EntityDetailsCard
              title="Class Overview"
              description={classData.description}
              chips={
                <>
                  <ValueChip label={`Hit Die: d${classData.hd || 8}`} />
                  {bonusSpellAbility && <ValueChip label={`Bonus Spells: ${bonusSpellAbility.name}`} color="info" />}
                  {classData.casterTypeValue && (
                    <ValueChip label={`Caster Type: ${classData.casterTypeValue}`} color="info" />
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
                      canSave: sync.isDirty,
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
      <EntityDeleteDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        what="Class"
        restorable={restorable}
        changesError={changesError}
        onConfirm={() => deleteMutation.mutate()}
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}
