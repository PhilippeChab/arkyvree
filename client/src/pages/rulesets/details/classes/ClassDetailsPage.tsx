import { MenuItem, Stack, TextField } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import { type SectionTab, SectionTabPanel, SectionTabs, ValueChip } from "@/client/src/components/common/index.ts";
import {
  FeatPoolsIcon,
  LevelsIcon,
  PowersIcon,
  SkillsIcon,
  SpellsIcon,
  SpellUsesIcon,
} from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import {
  useFormSync,
  useFormWith,
  usePageTitle,
  useRulesetAbilities,
  useRulesetPermissions,
} from "@/client/src/hooks/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { formatDie } from "@/client/src/lib/formatNumeric.ts";
import { rulesetDetailQuery } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import {
  EntityDetailLayout,
  EntityDetailsCard,
  EntityPageError,
} from "@/client/src/pages/rulesets/components/index.ts";
import { propertiesQuery } from "@/client/src/pages/rulesets/customization/customizationSectionQueries.ts";
import { CUSTOMIZATION_TABS } from "@/client/src/pages/rulesets/customization/sections/index.ts";
import { invalidateRulesetEdit } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { entityPageBack } from "@/client/src/pages/rulesets/entityPageState.ts";
import { followCopiesOf } from "@/client/src/pages/rulesets/followCopies.ts";
import { useCopyOnWrite, useEntitySave, useRestorableDelete } from "@/client/src/pages/rulesets/hooks/index.ts";
import { isStillOpen } from "@/client/src/pages/rulesets/stillOpen.ts";
import { getVocabulary, type RulesetVocabulary } from "@/client/src/pages/rulesets/vocabularyFactory.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { DEFAULT_BASE_RULES } from "@/shared/enums.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

import { getClassForms } from "./classFormFactory.ts";
import {
  classDetailQuery,
  type ClassFormData,
  type ClassSection,
  prefetchClassSection,
} from "./classSectionQueries.ts";
import { CLASS_SECTIONS } from "./sections/index.ts";

/** A class property a select sets: its type, as the ruleset's vocabulary names it, and its value ("" clears it). */
interface PropertyChoice {
  type: string;
  value: string;
}

const TABS: SectionTab<ClassSection>[] = [
  { key: "levels", label: "Levels", icon: LevelsIcon },
  { key: "skills", label: "Skills", icon: SkillsIcon },
  { key: "feat-pools", label: "Feat Pools", icon: FeatPoolsIcon },
  { key: "spells-known", label: "Spells Known", icon: SpellsIcon },
  { key: "spells-per-day", label: "Spells per Day", icon: SpellUsesIcon },
  { key: "spell-list", label: "Spell List", icon: PowersIcon },
  ...CUSTOMIZATION_TABS,
];

function isClassSection(section: string | undefined): section is ClassSection {
  return TABS.some((tab) => tab.key === section);
}

/**
 * A property select's help: what the property is for (`help`, its ruleset's words by type), and that it saves as it's
 * picked, apart from the card's Save.
 */
function propertyHelp(help: RulesetVocabulary["classes"]["propertyHelp"], type: string) {
  return `${help[type]}. Saves as it's picked.`;
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
  // A save of an inherited class copies it, and the page follows the copy: its details' save, and the bonus spell and
  // caster type selects, which write the class's properties, here; its Levels, Skills and customization tabs' saves
  // through theirs (`useClassCopy`)
  const copy = useCopyOnWrite(rulesetId, classId, (id) => `classes/${id}`);
  const { tag, follow } = followCopiesOf(classId, copy.followCopy);

  const { data: ruleset, isLoading: isRulesetLoading, error: rulesetError } = useQuery(rulesetDetailQuery(rulesetId));

  const {
    data: classData,
    isLoading: isClassLoading,
    isFetching: isClassFetching,
    error: classError,
  } = useQuery(classDetailQuery(rulesetId, classId));

  usePageTitle(classData?.name);

  // The ruleset's class form: until the ruleset loads, the form opens on the default base rules' empty class, which
  // it never shows (its editor renders once the class and its ruleset have loaded)
  const classForms = getClassForms(ruleset?.baseRules ?? DEFAULT_BASE_RULES);
  const editForm = useFormWith<ClassFormData>(classForms.emptyClass);

  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);
  // Deleting an inherited class, or what it holds, can be undone
  const { restorable, error: changesError } = useRestorableDelete(ruleset, classData);

  const sync = useFormSync(editForm, classData && ruleset && classForms.toClassForm(classData), {
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
    toFormValues: classForms.toClassForm,
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

  // Each select names the property it sets, as the ruleset's vocabulary names it
  const bonusSpellMutation = useMutation({
    mutationFn: ({ type, value }: PropertyChoice) =>
      setPropertyFn(type, classData?.propertyIds.bonusSpellAbilityId, value),
    onSuccess: handleClassPropertySaved("Bonus spell ability updated"),
    onError: (error) => snackbar.error(error, "Failed to update bonus spell ability"),
  });

  const casterTypeMutation = useMutation({
    mutationFn: ({ type, value }: PropertyChoice) => setPropertyFn(type, classData?.propertyIds.casterType, value),
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
  const classVocabulary = ruleset && getVocabulary(ruleset.baseRules).classes;
  const bonusSpellAbility = abilities?.find((a) => a.id === classData?.bonusSpellAbilityId);

  return (
    <>
      {forgetSource && <Navigate to={forgetSource.to} replace state={forgetSource.state} />}
      <EntityDetailLayout
        entityName={classData?.name}
        rulesetName={ruleset?.name}
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
        {classData && ruleset && classVocabulary && (
          <>
            <EntityDetailsCard
              title="Class Details"
              description={classData.description}
              chips={
                <>
                  <ValueChip label={formatDie(classData.hd)} />
                  {bonusSpellAbility && (
                    <ValueChip label={`Bonus Spell Ability: ${bonusSpellAbility.name}`} color="info" />
                  )}
                  {classData.casterType && <ValueChip label={`Caster Type: ${classData.casterType}`} color="info" />}
                </>
              }
              edit={
                canEdit
                  ? {
                      fields: (
                        <>
                          <classForms.ClassFormFields form={editForm} />
                          <TextField
                            label="Bonus Spell Ability"
                            fullWidth
                            select
                            // Empty until the abilities load: a value with no option is out of range.
                            value={bonusSpellAbility?.id ?? ""}
                            onChange={(e) =>
                              bonusSpellMutation.mutate({
                                type: classVocabulary.bonusSpellAbilityProperty,
                                value: e.target.value,
                              })
                            }
                            disabled={!abilities || bonusSpellMutation.isPending || isClassFetching}
                            error={!!abilitiesError && !abilities}
                            helperText={
                              !abilities && abilitiesError
                                ? loadFailureMessage("Abilities", abilitiesError)
                                : propertyHelp(classVocabulary.propertyHelp, classVocabulary.bonusSpellAbilityProperty)
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
                            value={classData.casterType ?? ""}
                            onChange={(e) =>
                              casterTypeMutation.mutate({
                                type: classVocabulary.casterTypeProperty,
                                value: e.target.value,
                              })
                            }
                            disabled={casterTypeMutation.isPending || isClassFetching}
                            helperText={propertyHelp(classVocabulary.propertyHelp, classVocabulary.casterTypeProperty)}
                          >
                            <MenuItem value="">None</MenuItem>
                            {classVocabulary.casterTypes.map((casterType) => (
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
