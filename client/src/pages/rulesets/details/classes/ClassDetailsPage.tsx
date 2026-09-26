import { DeleteDialog, DiceSpinner, SectionTabs, type SectionTab } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { EntityDetailLayout } from "@/client/src/pages/rulesets/components/index.ts";
import { useRulesetPermissions } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rulesetDetailQuery } from "@/client/src/lib/queries.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import {
  ClassFormFields,
  type ClassFormData,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { type HitDieValue } from "@/shared/dnd3.5/classes.ts";
import {
  Bolt as SpellListIcon,
  EmojiEvents as FeatPoolsIcon,
  TrendingUp as LevelsIcon,
  Psychology as SkillsIcon,
  AutoStories as SpellsIcon,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormSync, usePageTitle, useRulesetAbilities } from "@/client/src/hooks/index.ts";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { prefetchClassSection, type ClassSection } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import {
  ClassFeatPoolsSection,
  ClassLevelsSection,
  ClassSkillsSection,
  ClassSpellListSection,
  ClassSpellsKnownSection,
  ClassSpellsSection,
} from "./sections/index.ts";

const TABS: SectionTab<ClassSection>[] = [
  { key: "levels", label: "Levels", icon: LevelsIcon },
  { key: "skills", label: "Skills", icon: SkillsIcon },
  { key: "feat-pools", label: "Feat Pools", icon: FeatPoolsIcon },
  { key: "spells-known", label: "Spells Known", icon: SpellsIcon },
  { key: "spells", label: "Spell Uses", icon: SpellsIcon },
  { key: "spell-list", label: "Spells", icon: SpellListIcon },
];

const SECTION_COMPONENTS = {
  levels: ClassLevelsSection,
  skills: ClassSkillsSection,
  "feat-pools": ClassFeatPoolsSection,
  "spells-known": ClassSpellsKnownSection,
  spells: ClassSpellsSection,
  "spell-list": ClassSpellListSection,
} as const;

// Class settings stored as customization properties of the class.
const BONUS_SPELL_ABILITY_TYPE = "KLASS_BONUS_SPELL_ABILITY_ID";
const CASTER_TYPE_PROPERTY_TYPE = "KLASS_CASTER_TYPE";

const toClassForm = (klass: { name: string; description: string | null; hd: number | null }): ClassFormData => ({
  name: klass.name,
  description: klass.description ?? undefined,
  hd: (klass.hd ?? 8) as HitDieValue,
});

const isClassSection = (section: string | undefined): section is ClassSection =>
  TABS.some((tab) => tab.key === section);

export default function ClassDetailsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const { id: rulesetId = "", classId = "", section } = useParams<{
    id: string;
    classId: string;
    section?: string;
  }>();
  const backUrl = (location.state as { from?: string } | null)?.from ?? `/rulesets/${rulesetId}/classes`;
  const currentTab: ClassSection = isClassSection(section) ? section : "levels";

  const { data: ruleset, isLoading: isRulesetLoading } = useQuery(rulesetDetailQuery(rulesetId));

  const { data: classData, isLoading: isClassLoading } = useQuery({
    queryKey: queryKeys.rulesets.classDetail(rulesetId, classId),
    queryFn: () => parseResponse(rpc.api.rulesets[":id"].classes[":classId"].$get({
      param: { id: rulesetId, classId },
    })),
  });

  usePageTitle(classData?.name);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const editForm = useForm<ClassFormData>();

  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);

  const syncedUpdatedAt = useFormSync(editForm, classData && toClassForm(classData), classData?.updatedAt);

  const { data: abilities } = useRulesetAbilities(rulesetId);

  const updateMutation = useMutation({
    mutationFn: (data: ClassFormData) => parseResponse(rpc.api.rulesets[":id"].classes[":classId"].$put({
      param: { id: rulesetId, classId },
      json: { ...data, updatedAt: syncedUpdatedAt() },
    })),
    onSuccess: (data) => {
      editForm.reset(toClassForm(data));
      queryClient.setQueryData(queryKeys.rulesets.classDetail(rulesetId, data.id), data);
      // Editing an inherited class copies it into this ruleset under a new id.
      if (data.id !== classId) {
        navigate(`/rulesets/${rulesetId}/classes/${data.id}/${currentTab}`, { replace: true, state: location.state });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(rulesetId, "classes") });
      snackbar.success("Class updated");
    },
    onError: (err) => snackbar.error(err, "Failed to update class"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => rpc.api.rulesets[":id"].classes[":classId"].$delete({ param: { id: rulesetId, classId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(rulesetId, "classes") });
      snackbar.success("Class deleted");
      navigate(backUrl);
    },
    onError: (err) => snackbar.error(err, "Failed to delete class"),
  });

  // Create, update or clear (empty value) the class's single property of a type.
  const setClassProperty = async (type: string, propertyId: string | null | undefined, value: string) => {
    const param = { id: rulesetId, entityType: "klasses" as const, entityId: classData?.id ?? classId };
    const endpoint = rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].properties;
    if (!propertyId) {
      await endpoint.$post({ param, json: { type, value } });
    } else if (!value) {
      await endpoint[":property_id"].$delete({ param: { ...param, property_id: propertyId } });
    } else {
      await endpoint[":property_id"].$put({ param: { ...param, property_id: propertyId }, json: { type, value } });
    }
  };

  const onClassPropertySaved = (message: string) => () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.classDetail(rulesetId, classId) });
    snackbar.success(message);
  };

  const bonusSpellMutation = useMutation({
    mutationFn: (abilityId: string) =>
      setClassProperty(BONUS_SPELL_ABILITY_TYPE, classData?.bonusSpellPropertyId, abilityId),
    onSuccess: onClassPropertySaved("Bonus spell ability updated"),
    onError: (err) => snackbar.error(err, "Failed to update bonus spell ability"),
  });

  const casterTypeMutation = useMutation({
    mutationFn: (casterType: string) =>
      setClassProperty(CASTER_TYPE_PROPERTY_TYPE, classData?.casterTypePropertyId, casterType),
    onSuccess: onClassPropertySaved("Caster type updated"),
    onError: (err) => snackbar.error(err, "Failed to update caster type"),
  });

  // Normalize the URL to a known tab.
  useEffect(() => {
    if (rulesetId && classId && !isClassSection(section)) {
      navigate(`/rulesets/${rulesetId}/classes/${classId}/levels`, { replace: true });
    }
  }, [rulesetId, classId, section, navigate]);

  const isLoading = isRulesetLoading || isClassLoading;

  if (!isLoading && (!ruleset || !classData)) {
    return (
      <Box sx={{ maxWidth: 1200, margin: "0 auto", p: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" color="error">
          {!ruleset ? "Ruleset not found" : "Class not found"}
        </Typography>
      </Box>
    );
  }

  const Section = SECTION_COMPONENTS[currentTab];
  const bonusSpellAbilityName = abilities?.find((a) => a.id === classData?.bonusSpellAbilityId)?.name;

  return (
    <>
      <EntityDetailLayout
        entityName={classData?.name}
        rulesetName={ruleset?.name}
        onBack={() => navigate(backUrl)}
        canDelete={canEdit}
        onDelete={() => setDeleteDialogOpen(true)}
        isLoading={isLoading}
      >
        {classData && ruleset && (
          <>
            <Card sx={{ mb: 4, boxShadow: 2, borderRadius: 2, border: 1, borderColor: "divider" }}>
              <CardContent sx={{ p: 0 }}>
                <Box sx={{ p: { xs: 2, sm: 3 }, pb: 2, borderBottom: 1, borderColor: "divider", bgcolor: "action.hover" }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
                    <Typography component="h2" variant="h6" sx={{ fontWeight: 600, color: "primary.main" }}>
                      Class Overview
                    </Typography>
                    {!canEdit && (
                      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                        <Chip label={`Hit Die: d${classData.hd || 8}`} color="secondary" sx={{ fontWeight: 600 }} />
                        {bonusSpellAbilityName && (
                          <Chip label={`Bonus Spells: ${bonusSpellAbilityName}`} color="info" variant="outlined" />
                        )}
                        {classData.casterTypeValue && (
                          <Chip label={`Caster Type: ${classData.casterTypeValue}`} color="info" variant="outlined" />
                        )}
                      </Box>
                    )}
                  </Box>
                </Box>

                <Box sx={{ p: { xs: 2, sm: 3 } }}>
                  {canEdit ? (
                    <form onSubmit={editForm.handleSubmit((data) => updateMutation.mutate(data))}>
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <ClassFormFields form={editForm} />
                        <TextField
                          label="Spellcasting Ability"
                          fullWidth
                          select
                          value={classData.bonusSpellAbilityId ?? ""}
                          onChange={(e) => bonusSpellMutation.mutate(e.target.value)}
                          disabled={bonusSpellMutation.isPending}
                        >
                          <MenuItem value="">None</MenuItem>
                          {abilities?.map((a) => (
                            <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
                          ))}
                        </TextField>
                        <TextField
                          label="Caster Type"
                          fullWidth
                          select
                          value={classData.casterTypeValue ?? ""}
                          onChange={(e) => casterTypeMutation.mutate(e.target.value)}
                          disabled={casterTypeMutation.isPending}
                          helperText="Whether this class casts arcane or divine spells"
                        >
                          <MenuItem value="">None</MenuItem>
                          <MenuItem value="Arcane">Arcane</MenuItem>
                          <MenuItem value="Divine">Divine</MenuItem>
                        </TextField>
                        <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                          <Button type="submit" variant="contained" disabled={!editForm.formState.isDirty || updateMutation.isPending}>
                            <DiceSpinner size="small" loading={updateMutation.isPending}>Save</DiceSpinner>
                          </Button>
                        </Box>
                      </Box>
                    </form>
                  ) : (
                    <Typography variant="body1" sx={{ color: "text.secondary", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                      {classData.description || "No description provided."}
                    </Typography>
                  )}
                </Box>
              </CardContent>
            </Card>

            <SectionTabs
              tabs={TABS}
              value={currentTab}
              onChange={(key) => navigate(`/rulesets/${rulesetId}/classes/${classId}/${key}`)}
              onTabHover={(key) => void prefetchClassSection(queryClient, rulesetId, classId, key)}
              aria-label="class details tabs"
            />

            <Box role="tabpanel">
              <Section rulesetId={rulesetId} classId={classId} className={classData.name} ruleset={ruleset} />
            </Box>
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
