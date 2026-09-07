import { DeleteDialog, DiceSpinner } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { usePermissions } from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import {
  ClassFormFields,
  type ClassFormData,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { type HitDieValue } from "@/shared/dnd3.5/classes.ts";
import {
  ArrowBack,
  Bolt as SpellListIcon,
  EmojiEvents as FeatPoolsIcon,
  MoreVert as MoreVertIcon,
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
  IconButton,
  Menu,
  MenuItem,
  Skeleton,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ClassFeatPoolsSection,
  ClassLevelsSection,
  ClassSkillsSection,
  ClassSpellListSection,
  ClassSpellsKnownSection,
  ClassSpellsSection,
} from "./sections/index.ts";

type TabSection = "levels" | "skills" | "feat-pools" | "spells-known" | "spell-list" | "spells";

const TAB_CONFIG = [
  { key: "levels", label: "Levels", icon: LevelsIcon, component: ClassLevelsSection },
  { key: "skills", label: "Skills", icon: SkillsIcon, component: ClassSkillsSection },
  { key: "feat-pools", label: "Feat Pools", icon: FeatPoolsIcon, component: ClassFeatPoolsSection },
  { key: "spells-known", label: "Spells Known", icon: SpellsIcon, component: ClassSpellsKnownSection },
  { key: "spells", label: "Spell Uses", icon: SpellsIcon, component: ClassSpellsSection },
  { key: "spell-list", label: "Spells", icon: SpellListIcon, component: ClassSpellListSection },
] as const;

const TAB_SECTIONS: TabSection[] = TAB_CONFIG.map(tab => tab.key);

export default function ClassDetailsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: rulesetId, classId, section } = useParams<{
    id: string;
    classId: string;
    section?: string;
  }>();
  const backUrl = (location.state as { from?: string })?.from ?? `/rulesets/${rulesetId}/classes`;

  // Get current tab value based on URL section
  const getTabValue = (): number => {
    if (!section) return 0;
    const index = TAB_SECTIONS.indexOf(section as TabSection);
    return index >= 0 ? index : 0;
  };

  const { data: ruleset, isLoading: isRulesetLoading } = useQuery({
    queryKey: queryKeys.rulesets.detail(rulesetId!),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].$get({
        param: { id: rulesetId! },
      });
      if (!response.ok) throw new Error("Failed to fetch ruleset");
      return response.json();
    },
    enabled: !!rulesetId,
  });

  const { data: classData, isLoading: isClassLoading } = useQuery({
    queryKey: queryKeys.rulesets.classDetail(rulesetId!, classId!),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].classes[":classId"].$get({
        param: { id: rulesetId!, classId: classId! },
      });
      if (!response.ok) throw new Error("Failed to fetch class");
      return response.json();
    },
    enabled: !!rulesetId && !!classId,
  });

  usePageTitle(classData?.name);

  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const currentTabValue = getTabValue();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const editForm = useForm<ClassFormData>();

  const { canEdit, canDelete } = usePermissions(
    ruleset ?? { userId: null, status: undefined },
    currentUserId,
  );

  useEffect(() => {
    if (classData) {
      editForm.reset({
        name: classData.name,
        description: classData.description ?? undefined,
        hd: (classData.hd ?? 8) as HitDieValue,
      });
    }
  }, [classData, editForm]);

  const updateMutation = useMutation({
    mutationFn: async (data: ClassFormData) => {
      const response = await rpc.api.rulesets[":id"].classes[":classId"].$put({
        param: { id: rulesetId!, classId: classId! },
        json: { ...data, updatedAt: classData?.updatedAt },
      });
      if (!response.ok) throw new Error("Failed to update class");
      return response.json();
    },
    onSuccess: (data) => {
      const newId = (data as { id: string }).id;
      queryClient.setQueryData(queryKeys.rulesets.classDetail(rulesetId!, newId), data);
      if (newId !== classId) {
        const tab = TAB_SECTIONS[currentTabValue];
        navigate(`/rulesets/${rulesetId}/classes/${newId}${tab ? `/${tab}` : ""}`, { replace: true, state: location.state });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(rulesetId!, "classes") });
      snackbar.success("Class updated");
    },
    onError: (err) => snackbar.error(err, "Failed to update class"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await rpc.api.rulesets[":id"].classes[":classId"].$delete({
        param: { id: rulesetId!, classId: classId! },
      });
      if (!response.ok) throw new Error("Failed to delete class");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(rulesetId!, "classes") });
      snackbar.success("Class deleted");
      navigate(backUrl);
    },
    onError: (err) => snackbar.error(err, "Failed to delete class"),
  });

  // Bonus spell ability
  const BONUS_SPELL_ABILITY_TYPE = "KLASS_BONUS_SPELL_ABILITY_ID";

  const { data: abilities } = useQuery({
    queryKey: queryKeys.rulesets.section(rulesetId!, "abilities-for-class"),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].abilities.$get({
        param: { id: rulesetId! },
        query: { page: "1", limit: "100" },
      });
      if (!response.ok) throw new Error("Failed to fetch abilities");
      return response.json();
    },
    enabled: !!rulesetId,
  });

  const bonusSpellMutation = useMutation({
    mutationFn: async (abilityId: string) => {
      const entityId = classData?.id ?? classId!;
      const propertyId = classData?.bonusSpellPropertyId;

      if (propertyId) {
        if (!abilityId) {
          const response = await rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].properties[":property_id"].$delete({
            param: { id: rulesetId!, entityType: "klasses", entityId, property_id: propertyId },
          });
          if (!response.ok) throw new Error("Failed to delete property");
          return response.json();
        }
        const response = await rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].properties[":property_id"].$put({
          param: { id: rulesetId!, entityType: "klasses", entityId, property_id: propertyId },
          json: { type: BONUS_SPELL_ABILITY_TYPE, value: abilityId },
        });
        if (!response.ok) throw new Error("Failed to update property");
        return response.json();
      }

      const response = await rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].properties.$post({
        param: { id: rulesetId!, entityType: "klasses", entityId },
        json: { type: BONUS_SPELL_ABILITY_TYPE, value: abilityId },
      });
      if (!response.ok) throw new Error("Failed to create property");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.classDetail(rulesetId!, classId!) });
      snackbar.success("Bonus spell ability updated");
    },
    onError: (err) => snackbar.error(err, "Failed to update bonus spell ability"),
  });

  // Caster type
  const CASTER_TYPE_PROPERTY_TYPE = "KLASS_CASTER_TYPE";

  const casterTypeMutation = useMutation({
    mutationFn: async (casterType: string) => {
      const entityId = classData?.id ?? classId!;
      const propertyId = classData?.casterTypePropertyId;

      if (propertyId) {
        if (!casterType) {
          const response = await rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].properties[":property_id"].$delete({
            param: { id: rulesetId!, entityType: "klasses", entityId, property_id: propertyId },
          });
          if (!response.ok) throw new Error("Failed to delete property");
          return response.json();
        }
        const response = await rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].properties[":property_id"].$put({
          param: { id: rulesetId!, entityType: "klasses", entityId, property_id: propertyId },
          json: { type: CASTER_TYPE_PROPERTY_TYPE, value: casterType },
        });
        if (!response.ok) throw new Error("Failed to update property");
        return response.json();
      }

      const response = await rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].properties.$post({
        param: { id: rulesetId!, entityType: "klasses", entityId },
        json: { type: CASTER_TYPE_PROPERTY_TYPE, value: casterType },
      });
      if (!response.ok) throw new Error("Failed to create property");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.classDetail(rulesetId!, classId!) });
      snackbar.success("Caster type updated");
    },
    onError: (err) => snackbar.error(err, "Failed to update caster type"),
  });

  const prefetchClassSection = useCallback((sectionKey: TabSection) => {
    if (!rulesetId || !classId) return;
    if (sectionKey === "levels") {
      queryClient.prefetchQuery({
        queryKey: queryKeys.rulesets.classLevels(rulesetId, classId),
        queryFn: async () => {
          const response = await rpc.api.rulesets[":id"].classes[":classId"].levels.$get({
            param: { id: rulesetId, classId },
          });
          if (!response.ok) throw new Error("Failed to fetch levels");
          return response.json();
        },
      });
    } else if (sectionKey === "spells") {
      queryClient.prefetchQuery({
        queryKey: queryKeys.rulesets.classSpells(rulesetId, classId),
        queryFn: async () => {
          const response = await rpc.api.rulesets[":id"].classes[":classId"].spells.$get({
            param: { id: rulesetId, classId },
          });
          if (!response.ok) throw new Error("Failed to fetch spells");
          return response.json();
        },
      });
    } else if (sectionKey === "feat-pools") {
      queryClient.prefetchQuery({
        queryKey: queryKeys.rulesets.classFeatPools(rulesetId, classId),
        queryFn: async () => {
          const response = await rpc.api.rulesets[":id"].classes[":classId"]["feat-pools"].$get({
            param: { id: rulesetId, classId },
          });
          if (!response.ok) throw new Error("Failed to fetch feat pools");
          return response.json();
        },
      });
    } else if (sectionKey === "spells-known") {
      queryClient.prefetchQuery({
        queryKey: queryKeys.rulesets.classSpellsKnown(rulesetId, classId),
        queryFn: async () => {
          const response = await rpc.api.rulesets[":id"].classes[":classId"]["spells-known"].$get({
            param: { id: rulesetId, classId },
          });
          if (!response.ok) throw new Error("Failed to fetch spells known");
          return response.json();
        },
      });
    } else if (sectionKey === "spell-list") {
      queryClient.prefetchQuery({
        queryKey: queryKeys.rulesets.classSpellList(rulesetId, classId, 0),
        queryFn: async () => {
          const response = await rpc.api.rulesets[":id"].classes[":classId"]["spell-list"].$get({
            param: { id: rulesetId, classId },
            query: { level: "0", page: "1", limit: "20" },
          });
          if (!response.ok) throw new Error("Failed to fetch spell list");
          return response.json();
        },
      });
    } else {
      queryClient.prefetchQuery({
        queryKey: queryKeys.rulesets.classSkills(rulesetId, classId),
        queryFn: async () => {
          const response = await rpc.api.rulesets[":id"].classes[":classId"].skills.$get({
            param: { id: rulesetId, classId },
          });
          if (!response.ok) throw new Error("Failed to fetch skills");
          return response.json();
        },
      });
    }
  }, [rulesetId, classId, queryClient]);

  useEffect(() => {
    if (rulesetId && classId && !section) {
      navigate(`/rulesets/${rulesetId}/classes/${classId}/levels`, { replace: true });
    }
  }, [rulesetId, classId, section, navigate]);

  const handleBack = () => {
    navigate(backUrl);
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    const newSection = TAB_SECTIONS[newValue];
    navigate(`/rulesets/${rulesetId}/classes/${classId}/${newSection}`);
  };

  const formatHitDie = (hitDie: number | null | undefined) => `d${hitDie || 8}`;

  if (isRulesetLoading || isClassLoading) {
    return (
      <Box sx={{ maxWidth: 1200, margin: "0 auto", p: { xs: 2, sm: 3 } }}>
        <Box sx={{ mb: 4, display: "flex", alignItems: "center", py: 2, borderBottom: 1, borderColor: "divider", position: "relative" }}>
          <Skeleton variant="circular" width={40} height={40} sx={{ position: "absolute", left: 0 }} />
          <Box sx={{ flexGrow: 1, textAlign: "center", px: { xs: 5, sm: 8 } }}>
            <Skeleton variant="text" width={200} height={40} sx={{ mx: "auto" }} />
            <Skeleton variant="text" width={150} height={24} sx={{ mx: "auto" }} />
          </Box>
        </Box>
        <Card sx={{ mb: 4, boxShadow: 2, borderRadius: 2, border: 1, borderColor: "divider" }}>
          <CardContent sx={{ p: 0 }}>
            <Box sx={{ p: { xs: 2, sm: 3 }, pb: 2, borderBottom: 1, borderColor: "divider", bgcolor: "action.hover" }}>
              <Skeleton variant="text" width={150} height={32} />
            </Box>
            <Box sx={{ p: { xs: 2, sm: 3 } }}>
              <Skeleton variant="text" width="100%" />
              <Skeleton variant="text" width="80%" />
            </Box>
          </CardContent>
        </Card>
        <Skeleton variant="rounded" height={56} sx={{ mb: 4, borderRadius: 2 }} />
        <Skeleton variant="rounded" height={300} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  if (!ruleset || !classData) {
    return (
      <Box sx={{ maxWidth: 1200, margin: "0 auto", p: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" color="error">
          {!ruleset ? "Ruleset not found" : "Class not found"}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1200, margin: "0 auto", p: { xs: 2, sm: 3 } }}>
      {/* Header */}
      <Box
        sx={{
          mb: 4,
          display: "flex",
          alignItems: "center",
          py: 2,
          borderBottom: 1,
          borderColor: "divider",
          position: "relative",
        }}
      >
        <IconButton
          onClick={handleBack}
          size="large"
          sx={{
            position: "absolute",
            left: 0,
            "&:hover": {
              bgcolor: "action.hover",
            },
          }}
        >
          <ArrowBack />
        </IconButton>
        <Box
          sx={{
            flexGrow: 1,
            textAlign: "center",
            px: { xs: 5, sm: 8 },
          }}
        >
          <Typography sx={{ fontWeight: 600, mb: 0.5, typography: { xs: "h5", md: "h4" } }}>
            {classData.name}
          </Typography>
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            {ruleset.name} Ruleset
          </Typography>
        </Box>
        {canDelete && (
          <>
            <IconButton
              size="large"
              onClick={(e) => setAnchorEl(e.currentTarget)}
              sx={{
                position: "absolute",
                right: 0,
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <MoreVertIcon />
            </IconButton>
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={() => setAnchorEl(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
            >
              <MenuItem onClick={() => { setAnchorEl(null); setDeleteDialogOpen(true); }} sx={{ color: "error.main" }}>
                Delete
              </MenuItem>
            </Menu>
          </>
        )}
      </Box>
      {/* Class Information Card */}
      <Card
        sx={{
          mb: 4,
          boxShadow: 2,
          borderRadius: 2,
          border: 1,
          borderColor: "divider",
        }}
      >
        <CardContent sx={{ p: 0 }}>
          <Box
            sx={{
              p: { xs: 2, sm: 3 },
              pb: 2,
              borderBottom: 1,
              borderColor: "divider",
              bgcolor: "action.hover",
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: 600, color: "primary.main" }}>
                Class Overview
              </Typography>
              {!canEdit && (
                <Box sx={{ display: "flex", gap: 1 }}>
                  <Chip
                    label={`Hit Die: ${formatHitDie(classData.hd)}`}
                    size="medium"
                    color="secondary"
                    variant="filled"
                    sx={{ fontWeight: 600 }}
                  />
                  {classData?.bonusSpellAbilityId && (() => {
                    const abilityName = abilities?.items.find((a) => a.id === classData.bonusSpellAbilityId)?.name;
                    return abilityName ? (
                      <Chip
                        label={`Bonus Spells: ${abilityName}`}
                        size="medium"
                        color="info"
                        variant="outlined"
                      />
                    ) : null;
                  })()}
                  {classData?.casterTypeValue && (
                    <Chip
                      label={`Caster Type: ${classData.casterTypeValue}`}
                      size="medium"
                      color="info"
                      variant="outlined"
                    />
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
                    value={classData?.bonusSpellAbilityId ?? ""}
                    onChange={(e) => bonusSpellMutation.mutate(e.target.value)}
                    disabled={bonusSpellMutation.isPending}
                  >
                    <MenuItem value="">None</MenuItem>
                    {abilities?.items.map((a) => (
                      <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Caster Type"
                    fullWidth
                    select
                    value={classData?.casterTypeValue ?? ""}
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
              <Typography
                variant="body1"
                sx={{
                  color: "text.secondary",
                  lineHeight: 1.6,
                  fontSize: "1rem"
                }}>
                {classData.description}
              </Typography>
            )}
          </Box>
        </CardContent>
      </Card>
      {/* Navigation Tabs */}
      <Box sx={{ borderRadius: 2, bgcolor: "action.hover", p: 1, mb: 4 }}>
        <Tabs
          value={currentTabValue}
          onChange={handleTabChange}
          aria-label="class details tabs"
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            "& .MuiTabs-indicator": {
              height: 3,
              borderRadius: 1.5,
            },
            "& .MuiTab-root": {
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.875rem",
              minHeight: 48,
              borderRadius: 1,
              mx: 0.5,
              "&:hover": {
                bgcolor: "action.hover",
              },
              "&.Mui-selected": {
                bgcolor: "background.default",
                boxShadow: 1,
              },
            },
            "& .MuiTabs-scrollButtons": {
              "&.Mui-disabled": {
                opacity: 0.3,
              },
            },
          }}
        >
          {TAB_CONFIG.map((tab) => (
            <Tab
              key={tab.key}
              icon={<tab.icon />}
              label={tab.label}
              iconPosition="start"
              onMouseEnter={() => prefetchClassSection(tab.key)}
            />
          ))}
        </Tabs>
      </Box>
      {/* Tab Content */}
      {TAB_CONFIG.map((tab, index) => (
        currentTabValue === index && (
          <tab.component
            key={tab.key}
            rulesetId={rulesetId!}
            classId={classId!}
            className={classData?.name}
            ruleset={ruleset}
          />
        )
      ))}
      <DeleteDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        title="Delete Class"
        message="Are you sure you want to delete this class? This action cannot be undone."
        onConfirm={() => deleteMutation.mutate()}
        isLoading={deleteMutation.isPending}
      />
    </Box>
  );
}
