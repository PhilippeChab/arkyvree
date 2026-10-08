import { MenuItem, Stack, TextField } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
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
  EntityDetailLayout,
  EntityDetailsCard,
  EntityPageError,
} from "@/client/src/pages/rulesets/components/index.ts";
import { propertiesQuery } from "@/client/src/pages/rulesets/customization/customizationSectionQueries.ts";
import { useCopyFollow } from "@/client/src/pages/rulesets/customization/sections/index.ts";
import { invalidateRulesetEdit } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { entityPageBack } from "@/client/src/pages/rulesets/entityPageState.ts";
import {
  useCopyOnWrite,
  useEntitySave,
  useRestorableDelete,
  useRulesetPermissions,
} from "@/client/src/pages/rulesets/hooks/index.ts";
import { isStillOpen } from "@/client/src/pages/rulesets/stillOpen.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { HIT_DIE_VALUES } from "@/shared/dnd3.5/classes.ts";
import {
  ENTITY_PROPERTY_TYPES,
  getStaticPropertyValues,
  KLASS_BONUS_SPELL_ABILITY_ID,
  KLASS_CASTER_TYPE,
} from "@/shared/dnd3.5/properties/index.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

import { type ClassDetail, classDetailQuery, type ClassSection, prefetchClassSection } from "./classSectionQueries.ts";
import { CLASS_SECTIONS } from "./sections/index.ts";

/** The caster types a class takes, the property's own options */
const CASTER_TYPES = getStaticPropertyValues(KLASS_CASTER_TYPE) ?? [];

/** What a class's properties are for, as their selects' help says it */
const KLASS_PROPERTY_HELP = ENTITY_PROPERTY_TYPES.klasses ?? {};

const TABS: SectionTab<ClassSection>[] = [
  { key: "levels", label: "Levels", icon: TrendingUpIcon },
  { key: "skills", label: "Skills", icon: SkillsIcon },
  { key: "feat-pools", label: "Feat Pools", icon: FeatPoolsIcon },
  { key: "spells-known", label: "Spells Known", icon: SpellsIcon },
  { key: "spells-per-day", label: "Spells per Day", icon: SpellUsesIcon },
  { key: "spell-list", label: "Spell List", icon: PowersIcon },
  { key: "properties", label: <HelpLabel label="Properties" help={PROPERTIES_HELP} />, icon: PropertiesIcon },
  { key: "modifiers", label: <HelpLabel label="Modifiers" help={MODIFIERS_HELP} />, icon: ModifiersIcon },
  { key: "requirements", label: <HelpLabel label="Requirements" help={REQUIREMENTS_HELP} />, icon: RequirementsIcon },
];

function isClassSection(section: string | undefined): section is ClassSection {
  return TABS.some((tab) => tab.key === section);
}

/** A property select's help: what the property is for, and that it saves as it's picked, apart from the card's Save. */
function propertyHelp(type: string) {
  return `${KLASS_PROPERTY_HELP[type]}. Saves as it's picked.`;
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
    toFormValues: toClassForm,
    storeSaved: (saved, sourceId) => {
      const savedKey = classDetailQuery(rulesetId, saved.id).queryKey;
      // The PUT returns the bare class row: keep showing the property fields (bonus spell ability, caster type) until
      // the refetch brings the saved class's own, their selects disabled until then; unless the page has left that
      // class while the save was in flight
      if (classData && isStillOpen(`/rulesets/${rulesetId}/classes/${sourceId}`))
        queryClient.setQueryData(savedKey, { ...classData, ...saved });
      void queryClient.invalidateQueries({ queryKey: savedKey, exact: true });
    },
    followCopy: copy.followCopy,
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
        deletion={
          canEdit
            ? {
                what: "Class",
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
        {classData && ruleset && (
          <>
            <EntityDetailsCard
              title="Class Details"
              description={classData.description}
              chips={
                <>
                  <ValueChip label={`Hit Die: d${classData.hd || 8}`} />
                  {bonusSpellAbility && (
                    <ValueChip label={`Bonus Spell Ability: ${bonusSpellAbility.name}`} color="info" />
                  )}
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
                            label="Bonus Spell Ability"
                            fullWidth
                            select
                            // Empty until the abilities load: a value with no option is out of range.
                            value={bonusSpellAbility?.id ?? ""}
                            onChange={(e) => bonusSpellMutation.mutate(e.target.value)}
                            disabled={!abilities || bonusSpellMutation.isPending || isClassFetching}
                            error={!!abilitiesError && !abilities}
                            helperText={
                              !abilities && abilitiesError
                                ? loadFailureMessage("Abilities", abilitiesError)
                                : propertyHelp(KLASS_BONUS_SPELL_ABILITY_ID)
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
                            helperText={propertyHelp(KLASS_CASTER_TYPE)}
                          >
                            <MenuItem value="">None</MenuItem>
                            {CASTER_TYPES.map((casterType) => (
                              <MenuItem key={casterType} value={casterType}>
                                {casterType}
                              </MenuItem>
                            ))}
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
    </>
  );
}
