import {
  TargetPathBreadcrumbs,
  type Aptitude,
} from "@/client/src/components/customization/index.ts";
import { FaqHelpIcon, DeleteDialog, DiceSpinner } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { MODIFIER_OPERATOR_LABELS } from "@/client/src/lib/operatorLabels.ts";
import { usePermissions } from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import {
  ItemFormFields,
  type ItemFormInternal,
  toItemPayload,
  SpellFormFields,
  type SpellFormData,
  type AptitudeMetadata,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { formatDecimal } from "@/client/src/lib/formatNumeric.ts";
import {
  FeatFormFields,
  type FeatFormData,
  RaceFormFields,
  type RaceFormData,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import type { Modifier, Property } from "@/shared/relations.ts";
import {
  ArrowBack,
  Label as PropertiesIcon,
  MoreVert as MoreVertIcon,
  Rule as RequirementsIcon,
  Settings as ModifiersIcon,
} from "@mui/icons-material";
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ModifiersSection, PropertiesSection, RequirementsSection } from "./sections/index.ts";
import type { BaseEntityType, EntityType } from "./types.ts";

type SavesResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["saves"]["$get"]>;
type SavesPaginated = Exclude<SavesResponse, { error: string }>;
type Save = SavesPaginated["items"][number];

type ClassLevelFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["classes"][":classId"]["levels"][":levelId"]["$put"]>["json"];

type FeatAptitudeOption = {
  featId: string;
  aptitudeId: string;
  featName: string;
  aptitudeName: string;
  label: string;
};
interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`customization-tabpanel-${index}`}
      aria-labelledby={`customization-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

type TabSection = "modifiers" | "requirements" | "properties";

const ALL_TAB_CONFIG = [
  {
    key: "properties",
    label: "Properties",
    icon: PropertiesIcon,
    component: PropertiesSection,
    helpIcon: <FaqHelpIcon text="Properties are additional attributes that can be applied to entities, providing extra characteristics or metadata." />,
  },
  {
    key: "modifiers",
    label: "Modifiers",
    icon: ModifiersIcon,
    component: ModifiersSection,
    helpIcon: <FaqHelpIcon text="Modifiers affect character attributes with operations like add, subtract, multiply. They can modify things like strength, AC, skills, etc." />,
  },
  {
    key: "requirements",
    label: "Requirements",
    icon: RequirementsIcon,
    component: RequirementsSection,
    helpIcon: <FaqHelpIcon text="Requirements are conditions that entities must meet to be usable/available. Examples include character level requirements, feat prerequisites, etc." />,
  },
] as const;

// For modifiers, only show requirements tab
const getTabConfig = (entityType: EntityType) => {
  if (entityType === "modifiers") {
    return ALL_TAB_CONFIG.filter((tab) => tab.key === "requirements");
  }
  return ALL_TAB_CONFIG;
};

const entityType_LABELS: Record<EntityType, string> = {
  feats: "Feat",
  klass_levels: "Class Level",
  klasses: "Class",
  items: "Item",
  powers: "Power",
  races: "Race",
  modifiers: "Modifier",
};

const EDITABLE_ENTITY_TYPES = ["feats", "races", "items", "powers", "klass_levels"] as const;

function isEditable(type: string): type is (typeof EDITABLE_ENTITY_TYPES)[number] {
  return (EDITABLE_ENTITY_TYPES as readonly string[]).includes(type);
}

export default function CustomizationPage() {
  const { id, entityType, entityId, section } = useParams<{
    id: string;
    entityType: string;
    entityId: string;
    section?: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const backUrl = (location.state as { from?: string })?.from;

  // Validate entityType
  const isValidEntityType = (type: string | undefined): type is EntityType => {
    return type !== undefined &&
      (["feats", "klass_levels", "klasses", "items", "powers", "races", "modifiers"] as const).includes(
        type as EntityType,
      );
  };

  const {
    data: ruleset,
    isLoading: rulesetLoading,
    error: rulesetError,
  } = useQuery({
    queryKey: queryKeys.rulesets.detail(id!),
    queryFn: async () => {
      if (!id) throw new Error("No ruleset ID provided");
      const response = await rpc.api.rulesets[":id"].$get({ param: { id } });
      if (!response.ok) throw new Error("Failed to fetch ruleset");
      return response.json();
    },
  });

  // Fetch entity details based on entityType
  const {
    data: entityData,
    isLoading: entityLoading,
    error: entityError,
  } = useQuery({
    queryKey: queryKeys.rulesets.entity(id!, entityType!, entityId!),
    queryFn: async () => {
      if (!id || !entityType || !entityId) throw new Error("Missing parameters");

      let response;
      switch (entityType) {
        case "modifiers": {
          response = await rpc.api.rulesets[":id"].customization[":entityType"][":entityId"]
            .modifiers[":modifierId"].$get({
              param: { id, entityType, entityId, modifierId: entityId },
            });
          if (!response.ok) throw new Error("Failed to fetch modifier");
          const modifier = await response.json();
          return {
            ...modifier,
            name: `${modifier.target} ${modifier.operator} ${modifier.value}`,
          };
        }
        case "feats": {
          response = await rpc.api.rulesets[":id"].feats[":featId"].$get({
            param: { id, featId: entityId },
          });
          if (!response.ok) throw new Error("Failed to fetch feat");
          return await response.json();
        }
        case "items": {
          response = await rpc.api.rulesets[":id"].items[":itemId"].$get({
            param: { id, itemId: entityId },
          });
          if (!response.ok) throw new Error("Failed to fetch item");
          return await response.json();
        }
        case "powers": {
          response = await rpc.api.rulesets[":id"].powers[":powerId"].$get({
            param: { id, powerId: entityId },
          });
          if (!response.ok) throw new Error("Failed to fetch power");
          return await response.json();
        }
        case "klass_levels": {
          response = await rpc.api.rulesets[":id"].class_levels[":classLevelId"]
            .$get({
              param: { id, classLevelId: entityId },
            });
          if (!response.ok) throw new Error("Failed to fetch class level");
          return await response.json();
        }
        case "races": {
          response = await rpc.api.rulesets[":id"].races[":raceId"].$get({
            param: { id, raceId: entityId },
          });
          if (!response.ok) throw new Error("Failed to fetch race");
          return await response.json();
        }
        case "klasses": {
          response = await rpc.api.rulesets[":id"].classes[":classId"].$get({
            param: { id, classId: entityId },
          });
          if (!response.ok) throw new Error("Failed to fetch class");
          return await response.json();
        }
        default:
          throw new Error("Invalid entity type");
      }
    },
    enabled: !!id && !!entityType && !!entityId,
  });

  const snackbar = useSnackbar();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Feat form state
  const featForm = useForm<FeatFormData>();
  const [selectedFeatAptitudes, setSelectedFeatAptitudes] = useState<Aptitude[]>([]);

  // Entity-specific form state
  const raceForm = useForm<RaceFormData>();
  const itemForm = useForm<ItemFormInternal>();
  const spellForm = useForm<SpellFormData>();

  // Spell aptitude state
  const [selectedSpellAptitudes, setSelectedSpellAptitudes] = useState<Aptitude[]>([]);
  const [spellAptitudeMetadata, setSpellAptitudeMetadata] = useState<AptitudeMetadata>(new Map());

  // Class level form state
  const classLevelForm = useForm<ClassLevelFormData>();
  const [selectedLevelFeats, setSelectedLevelFeats] = useState<FeatAptitudeOption[]>([]);
  const [levelSaveValues, setLevelSaveValues] = useState<Record<string, number>>({});

  // Initial external state refs for dirty tracking
  const initialFeatAptitudes = useRef<string[]>([]);
  const initialSpellAptitudes = useRef<string[]>([]);
  const initialSpellMetadata = useRef<string>("");
  const initialLevelFeats = useRef<string>("");
  const initialLevelSaves = useRef<string>("");

  // Saves query (for spell saveId select and class level saves)
  const { data: savesData } = useQuery({
    queryKey: queryKeys.rulesets.section(id!, "saves"),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].saves.$get({
        param: { id: id! },
        query: { limit: "100" },
      });
      if (!response.ok) throw new Error("Failed to fetch saves");
      return response.json();
    },
    enabled: !!id && (entityType === "powers" || entityType === "klass_levels"),
  });
  const saves: Save[] = savesData?.items ?? [];

  // Feats query (for class level feat selection)
  const { data: featsData } = useQuery({
    queryKey: queryKeys.rulesets.section(id!, "feats"),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].feats.$get({
        param: { id: id! },
        query: { limit: "100", page: "1" },
      });
      if (!response.ok) throw new Error("Failed to fetch feats");
      return response.json();
    },
    enabled: !!id && entityType === "klass_levels",
  });

  const featOptions = useMemo(() => {
    const feats = featsData?.items ?? [];
    return feats.flatMap((feat) =>
      feat.featsAptitudesInRules?.map((fa) => ({
        featId: feat.id,
        aptitudeId: fa.aptitudeId,
        featName: feat.name,
        aptitudeName: fa.aptitudesInRule?.name || "Unknown",
        label: `${feat.name} (${fa.aptitudesInRule?.name || "Unknown"})`,
      })) || [],
    );
  }, [featsData?.items]);

  usePageTitle((entityData as { name?: string } | undefined)?.name);

  useEffect(() => {
    if (entityData && entityType === "feats") {
      const feat = entityData as { name: string; description: string; featsAptitudesInRules?: { aptitudeId: string; aptitudesInRule?: Aptitude }[] };
      const aptitudes = (feat.featsAptitudesInRules ?? [])
        .filter((fa) => fa.aptitudesInRule)
        .map((fa) => fa.aptitudesInRule!);
      setSelectedFeatAptitudes(aptitudes);
      initialFeatAptitudes.current = aptitudes.map((a) => a.id).sort();
      featForm.reset({
        name: feat.name,
        description: feat.description,
        aptitudeIds: aptitudes.map((a) => a.id),
      });
    }
  }, [entityData, entityType, featForm]);

  useEffect(() => {
    if (entityData && entityType === "races") {
      const race = entityData as { name: string; description: string; size: RaceFormData["size"]; baseSpeed: number };
      raceForm.reset({
        name: race.name,
        description: race.description,
        size: race.size,
        baseSpeed: race.baseSpeed,
      });
    }
  }, [entityData, entityType, raceForm]);

  useEffect(() => {
    if (entityData && entityType === "items") {
      const item = entityData as { name: string; description: string; costGp: string | null; weight: string | null; type: string | null; slot: string | null; sourceItemId: string | null };
      itemForm.reset({
        name: item.name,
        description: item.description,
        costGp: formatDecimal(item.costGp) ?? "",
        weight: formatDecimal(item.weight) ?? "",
        type: item.type,
        slot: (item.slot ?? undefined) as ItemFormInternal["slot"],
        sourceItemId: item.sourceItemId ?? undefined,
      });
    }
  }, [entityData, entityType, itemForm]);

  useEffect(() => {
    if (entityData && entityType === "powers") {
      const spell = entityData as {
        name: string;
        description: string;
        saveId: string | null;
        saveEffect: string | null;
        powersAptitudesInRules?: { aptitudeId: string; level: number | null; aptitudesInRule?: Aptitude }[];
      };
      spellForm.reset({
        name: spell.name,
        description: spell.description,
        saveId: spell.saveId ?? null,
        saveEffect: spell.saveEffect ?? null,
      });
      const aptitudes = (spell.powersAptitudesInRules ?? [])
        .filter((pa) => pa.aptitudesInRule)
        .map((pa) => pa.aptitudesInRule!);
      setSelectedSpellAptitudes(aptitudes);
      initialSpellAptitudes.current = aptitudes.map((a) => a.id).sort();
      const metadata = new Map<string, { level?: number }>();
      for (const pa of spell.powersAptitudesInRules ?? []) {
        const entry: { level?: number } = {};
        if (pa.level != null) entry.level = pa.level;
        if (Object.keys(entry).length > 0) metadata.set(pa.aptitudeId, entry);
      }
      setSpellAptitudeMetadata(metadata);
      initialSpellMetadata.current = JSON.stringify(Array.from(metadata.entries()).sort());
    }
  }, [entityData, entityType, spellForm]);

  useEffect(() => {
    if (entityData && entityType === "klass_levels") {
      const level = entityData as {
        bab: number;
        skills: number;
        feats?: { id: string; name: string; aptitudeId: string; aptitudeName: string | null; free: boolean }[];
        saves?: { saveId: string; base: number }[];
      };
      classLevelForm.reset({});
      // Populate feats
      if (level.feats && level.feats.length > 0) {
        const feats = level.feats.map((feat) => {
          const matchingOption = featOptions.find((o) => o.featId === feat.id && o.aptitudeId === feat.aptitudeId);
          const aptitudeName = matchingOption?.aptitudeName ?? feat.aptitudeName ?? "Unknown";
          return matchingOption || {
            featId: feat.id,
            aptitudeId: feat.aptitudeId,
            featName: feat.name,
            aptitudeName,
            label: `${feat.name} (${aptitudeName})`,
          };
        });
        setSelectedLevelFeats(feats);
        initialLevelFeats.current = JSON.stringify(feats.map((f) => `${f.featId}-${f.aptitudeId}`).sort());
      } else {
        setSelectedLevelFeats([]);
        initialLevelFeats.current = "[]";
      }
      // Populate saves
      if (level.saves && level.saves.length > 0) {
        const values: Record<string, number> = {};
        for (const save of level.saves) {
          values[save.saveId] = save.base;
        }
        setLevelSaveValues(values);
        initialLevelSaves.current = JSON.stringify(Object.entries(values).sort());
      } else {
        setLevelSaveValues({});
        initialLevelSaves.current = "[]";
      }
    }
  }, [entityData, entityType, classLevelForm, featOptions]);

  const isFeatDirty = featForm.formState.isDirty ||
    JSON.stringify(selectedFeatAptitudes.map((a) => a.id).sort()) !== JSON.stringify(initialFeatAptitudes.current);

  const isSpellDirty = spellForm.formState.isDirty ||
    JSON.stringify(selectedSpellAptitudes.map((a) => a.id).sort()) !== JSON.stringify(initialSpellAptitudes.current) ||
    JSON.stringify(Array.from(spellAptitudeMetadata.entries()).sort()) !== initialSpellMetadata.current;

  const isClassLevelDirty =
    JSON.stringify(selectedLevelFeats.map((f) => `${f.featId}-${f.aptitudeId}`).sort()) !== initialLevelFeats.current ||
    JSON.stringify(Object.entries(levelSaveValues).sort()) !== initialLevelSaves.current;

  const { canEdit, canDelete } = usePermissions(
    ruleset ?? { userId: null, status: undefined },
    currentUserId,
  );

  const showDeleteAction = entityType ? isEditable(entityType) && canDelete : false;

  // Feat update mutation
  const updateFeatMutation = useMutation({
    mutationFn: async (data: FeatFormData) => {
      const response = await rpc.api.rulesets[":id"].feats[":featId"].$put({
        param: { id: id!, featId: entityId! },
        json: {
          ...data,
          aptitudeIds: selectedFeatAptitudes.map((a) => a.id),
          updatedAt: (entityData as { updatedAt?: string } | undefined)?.updatedAt,
        },
      });
      if (!response.ok) throw new Error("Failed to update feat");
      return response.json();
    },
    onSuccess: (data) => {
      const newId = (data as { id: string }).id;
      queryClient.setQueryData(queryKeys.rulesets.entity(id!, entityType!, newId), (old: unknown) =>
        old ? { ...(old as Record<string, unknown>), ...(data as Record<string, unknown>) } : data,
      );
      if (newId !== entityId) {
        navigate(`/rulesets/${id}/${entityType}/${newId}/customization/${section}`, { replace: true, state: location.state });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(id!, entityType!) });
      snackbar.success("Feat updated");
    },
    onError: (err) => snackbar.error(err, "Failed to update feat"),
  });

  // Race update mutation
  const updateRaceMutation = useMutation({
    mutationFn: async (data: RaceFormData) => {
      const response = await rpc.api.rulesets[":id"].races[":raceId"].$put({
        param: { id: id!, raceId: entityId! },
        json: { ...data, updatedAt: (entityData as { updatedAt?: string } | undefined)?.updatedAt },
      });
      if (!response.ok) throw new Error("Failed to update race");
      return response.json();
    },
    onSuccess: (data) => {
      const newId = (data as { id: string }).id;
      queryClient.setQueryData(queryKeys.rulesets.entity(id!, entityType!, newId), (old: unknown) =>
        old ? { ...(old as Record<string, unknown>), ...(data as Record<string, unknown>) } : data,
      );
      if (newId !== entityId) {
        navigate(`/rulesets/${id}/${entityType}/${newId}/customization/${section}`, { replace: true, state: location.state });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(id!, entityType!) });
      snackbar.success("Race updated");
    },
    onError: (err) => snackbar.error(err, "Failed to update race"),
  });

  // Item update mutation
  const updateItemMutation = useMutation({
    mutationFn: async (data: ItemFormInternal) => {
      const loadedUpdatedAt = (entityData as { updatedAt?: string } | undefined)?.updatedAt;
      const response = await rpc.api.rulesets[":id"].items[":itemId"].$put({
        param: { id: id!, itemId: entityId! },
        json: { ...toItemPayload(data), updatedAt: loadedUpdatedAt },
      });
      if (!response.ok) throw new Error("Failed to update item");
      return response.json();
    },
    onSuccess: (data) => {
      const newId = (data as { id: string }).id;
      itemForm.reset(itemForm.getValues());
      queryClient.setQueryData(queryKeys.rulesets.entity(id!, entityType!, newId), (old: unknown) =>
        old ? { ...(old as Record<string, unknown>), ...(data as Record<string, unknown>) } : data,
      );
      if (newId !== entityId) {
        navigate(`/rulesets/${id}/${entityType}/${newId}/customization/${section}`, { replace: true, state: location.state });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.entity(id!, entityType!, newId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(id!, entityType!) });
      snackbar.success("Item updated");
    },
    onError: (err) => snackbar.error(err, "Failed to update item"),
  });

  // Spell update mutation
  const updateSpellMutation = useMutation({
    mutationFn: async (data: SpellFormData & { aptitudes: { id: string; level?: number }[] }) => {
      const { aptitudes, ...rest } = data;
      const response = await rpc.api.rulesets[":id"].powers[":powerId"].$put({
        param: { id: id!, powerId: entityId! },
        json: {
          ...rest,
          aptitudes,
          updatedAt: (entityData as { updatedAt?: string } | undefined)?.updatedAt,
        },
      });
      if (!response.ok) throw new Error("Failed to update spell");
      return response.json();
    },
    onSuccess: (data) => {
      const newId = (data as { id: string }).id;
      if (newId !== entityId) {
        navigate(`/rulesets/${id}/${entityType}/${newId}/customization${section ? `/${section}` : ""}`, { replace: true, state: location.state });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.entity(id!, entityType!, newId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(id!, entityType!) });
      snackbar.success("Spell updated");
    },
    onError: (err) => snackbar.error(err, "Failed to update spell"),
  });

  // Class level update mutation
  const updateClassLevelMutation = useMutation({
    mutationFn: async () => {
      const klassId = (entityData as unknown as { klassId: string }).klassId;
      const response = await rpc.api.rulesets[":id"].classes[":classId"].levels[":levelId"].$put({
        param: { id: id!, classId: klassId, levelId: entityId! },
        json: {
          saves: saves.map((save) => ({
            saveId: save.id,
            base: levelSaveValues[save.id] ?? 0,
          })),
          feats: selectedLevelFeats.map((f) => ({ featId: f.featId, aptitudeId: f.aptitudeId, free: true })),
        },
      });
      if (!response.ok) throw new Error("Failed to update class level");
      return response.json();
    },
    onSuccess: (data) => {
      const newId = (data as { id: string }).id;
      const klassId = (entityData as unknown as { klassId: string }).klassId;
      queryClient.setQueryData(queryKeys.rulesets.entity(id!, entityType!, newId), (old: unknown) =>
        old ? { ...(old as Record<string, unknown>), ...(data as Record<string, unknown>) } : data,
      );
      if (newId !== entityId) {
        navigate(`/rulesets/${id}/${entityType}/${newId}/customization/${section}`, { replace: true, state: location.state });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.classLevels(id!, klassId) });
      snackbar.success("Class level updated");
    },
    onError: (err) => snackbar.error(err, "Failed to update class level"),
  });

  // Delete mutation (switches per entity type)
  const deleteMutation = useMutation({
    mutationFn: async () => {
      let response;
      switch (entityType) {
        case "feats":
          response = await rpc.api.rulesets[":id"].feats[":featId"].$delete({
            param: { id: id!, featId: entityId! },
          });
          break;
        case "races":
          response = await rpc.api.rulesets[":id"].races[":raceId"].$delete({
            param: { id: id!, raceId: entityId! },
          });
          break;
        case "items":
          response = await rpc.api.rulesets[":id"].items[":itemId"].$delete({
            param: { id: id!, itemId: entityId! },
          });
          break;
        case "powers":
          response = await rpc.api.rulesets[":id"].powers[":powerId"].$delete({
            param: { id: id!, powerId: entityId! },
          });
          break;
        case "klass_levels": {
          const klassId = (entityData as unknown as { klassId: string }).klassId;
          response = await rpc.api.rulesets[":id"].classes[":classId"].levels[":levelId"].$delete({
            param: { id: id!, classId: klassId, levelId: entityId! },
          });
          break;
        }
        default:
          throw new Error("Invalid entity type for delete");
      }
      if (!response.ok) throw new Error("Failed to delete");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(id!, entityType!) });
      const label = entityType_LABELS[entityType as EntityType];
      if (entityType === "klass_levels") {
        const klassId = (entityData as unknown as { klassId: string }).klassId;
        queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.classLevels(id!, klassId) });
        navigate(`/rulesets/${id}/classes/${klassId}/levels`);
        snackbar.success(`${label} deleted`);
      } else {
        navigate(backUrl ?? `/rulesets/${id}/${entityType}`);
        snackbar.success(`${label} deleted`);
      }
    },
    onError: (err) => snackbar.error(err, `Failed to delete ${entityType_LABELS[entityType as EntityType].toLowerCase()}`),
  });

  const currentTabConfig = getTabConfig(entityType as EntityType);
  const currentTabSections = currentTabConfig.map((tab) => tab.key);

  const currentTabValue = (() => {
    if (!section) return 0;
    const index = currentTabSections.indexOf(section as TabSection);
    return index >= 0 ? index : 0;
  })();

  const queryClient = useQueryClient();

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    const newSection = currentTabSections[newValue];
    navigate(`/rulesets/${id}/${entityType}/${entityId}/customization/${newSection}`);
  };

  const handleBack = () => {
    if (entityType === "modifiers") {
      const modifier = entityData as unknown as Modifier;
      navigate(
        `/rulesets/${id}/${modifier.sourceType}/${modifier.sourceId}/customization`,
      );
    } else if (entityType === "klass_levels") {
      const klassId = (entityData as unknown as { klassId: string }).klassId;
      navigate(`/rulesets/${id}/classes/${klassId}/levels`);
    } else if (entityType === "klasses") {
      navigate(`/rulesets/${id}/classes/${entityId}`);
    } else {
      navigate(backUrl ?? `/rulesets/${id}/${entityType}`);
    }
  };

  const handleEntityIdChange = useCallback((newEntityId: string) => {
    navigate(`/rulesets/${id}/${entityType}/${newEntityId}/customization/${section}`, { replace: true, state: location.state });
  }, [navigate, id, entityType, section, location.state]);

  // Redirect to first available tab if no section specified
  useEffect(() => {
    if (
      id && entityType && entityId &&
      (!section || !currentTabSections.includes(section as TabSection))
    ) {
      const defaultSection = currentTabSections[0] || "properties";
      navigate(`/rulesets/${id}/${entityType}/${entityId}/customization/${defaultSection}`, {
        replace: true,
        state: location.state,
      });
    }
  }, [id, entityType, entityId, section, navigate, currentTabSections, location.state]);

  const isLoading = rulesetLoading || entityLoading;
  const error = rulesetError || entityError;

  // Check for invalid entity type
  if (!isValidEntityType(entityType)) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Paper sx={{ p: { xs: 2, sm: 4 }, textAlign: "center" }}>
          <Typography variant="h5" color="error" gutterBottom>
            Invalid entity type: {entityType}
          </Typography>
          <Button
            variant="contained"
            onClick={() => navigate(`/rulesets/${id}`)}
            sx={{ mt: 2 }}
          >
            Back to Ruleset
          </Button>
        </Paper>
      </Container>
    );
  }

  if (isLoading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: 400,
          }}
        >
          <DiceSpinner />
        </Box>
      </Container>
    );
  }

  if (error || !ruleset || !entityData) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Paper sx={{ p: { xs: 2, sm: 4 }, textAlign: "center" }}>
          <Typography variant="h5" color="error" gutterBottom>
            Failed to load customization data
          </Typography>
          <Button
            variant="contained"
            onClick={() => navigate(`/rulesets/${id}`)}
            sx={{ mt: 2 }}
          >
            Back to Ruleset
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
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
            px: { xs: 5, md: 8 },
          }}
        >
          <Typography sx={{ typography: { xs: "h5", md: "h3" }, fontWeight: 700, mb: 1 }}>
            Customize{" "}
            {entityType === "modifiers"
              ? (entityData as unknown as { sourceName: string }).sourceName
              : (
                <>
                  {entityData.name}
                  {entityType === "klass_levels" && "level" in entityData ? ` Level ${entityData.level}` : ""}
                </>
              )}
          </Typography>
          {entityType === "modifiers" && "target" in entityData
            ? (
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, mb: 2 }}>
                <TargetPathBreadcrumbs target={(entityData as unknown as Modifier).target} targetLabels={"targetLabels" in entityData ? entityData.targetLabels as Record<string, string> : undefined} />
                <Typography sx={{ typography: { xs: "body1", sm: "h6" }, color: "text.secondary" }}>
                  {MODIFIER_OPERATOR_LABELS[(entityData as unknown as Modifier).operator]} {(entityData as unknown as Modifier).value}
                </Typography>
              </Box>
            )
            : (
              <Typography sx={{ typography: { xs: "body1", sm: "h6" }, color: "text.secondary", mb: 2 }}>
                {entityType_LABELS[entityType as EntityType]} in {ruleset.name}
              </Typography>
            )}
        </Box>
        {showDeleteAction && (
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
      {/* Feat Details Card */}
      {entityType === "feats" && (
        <Card sx={{ mb: 4, boxShadow: 2, borderRadius: 2, border: 1, borderColor: "divider" }}>
          <CardContent sx={{ p: 0 }}>
            <Box sx={{ p: { xs: 2, sm: 3 }, pb: 2, borderBottom: 1, borderColor: "divider", bgcolor: "action.hover" }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="h6" sx={{ fontWeight: 600, color: "primary.main" }}>
                  Feat Details
                </Typography>
                {!canEdit && selectedFeatAptitudes.length > 0 && (
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                    {selectedFeatAptitudes.map((apt) => (
                      <Chip key={apt.id} label={apt.name} size="small" color="primary" variant="outlined" />
                    ))}
                  </Box>
                )}
              </Box>
            </Box>
            <Box sx={{ p: { xs: 2, sm: 3 } }}>
              {canEdit ? (
                <form onSubmit={featForm.handleSubmit((data) => updateFeatMutation.mutate(data))}>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <FeatFormFields
                      form={featForm}
                      rulesetId={id!}
                      selectedAptitudes={selectedFeatAptitudes}
                      onAptitudesChange={setSelectedFeatAptitudes}
                    />
                    <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                      <Button type="submit" variant="contained" disabled={!isFeatDirty || updateFeatMutation.isPending}>
                        <DiceSpinner size="small" loading={updateFeatMutation.isPending}>Save</DiceSpinner>
                      </Button>
                    </Box>
                  </Box>
                </form>
              ) : (
                <Typography
                  variant="body1"
                  sx={{
                    color: "text.secondary",
                    lineHeight: 1.6
                  }}>
                  {(entityData as { description?: string })?.description || "No description provided."}
                </Typography>
              )}
            </Box>
          </CardContent>
        </Card>
      )}
      {/* Race Details Card */}
      {entityType === "races" && (
        <Card sx={{ mb: 4, boxShadow: 2, borderRadius: 2, border: 1, borderColor: "divider" }}>
          <CardContent sx={{ p: 0 }}>
            <Box sx={{ p: { xs: 2, sm: 3 }, pb: 2, borderBottom: 1, borderColor: "divider", bgcolor: "action.hover" }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="h6" sx={{ fontWeight: 600, color: "primary.main" }}>
                  Race Details
                </Typography>
                {!canEdit && (() => {
                  const race = entityData as { size?: string; baseSpeed?: number } | undefined;
                  return race ? (
                    <Box sx={{ display: "flex", gap: 0.5 }}>
                      {race.size && <Chip label={race.size} size="small" color="secondary" variant="filled" sx={{ fontWeight: 600 }} />}
                      {race.baseSpeed != null && <Chip label={`${race.baseSpeed} ft`} size="small" color="info" variant="outlined" />}
                    </Box>
                  ) : null;
                })()}
              </Box>
            </Box>
            <Box sx={{ p: { xs: 2, sm: 3 } }}>
              {canEdit ? (
                <form onSubmit={raceForm.handleSubmit((data) => updateRaceMutation.mutate(data))}>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <RaceFormFields form={raceForm} />
                    <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                      <Button type="submit" variant="contained" disabled={!raceForm.formState.isDirty || updateRaceMutation.isPending}>
                        <DiceSpinner size="small" loading={updateRaceMutation.isPending}>Save</DiceSpinner>
                      </Button>
                    </Box>
                  </Box>
                </form>
              ) : (
                <Typography
                  variant="body1"
                  sx={{
                    color: "text.secondary",
                    lineHeight: 1.6
                  }}>
                  {(entityData as { description?: string })?.description || "No description provided."}
                </Typography>
              )}
            </Box>
          </CardContent>
        </Card>
      )}
      {/* Item Details Card */}
      {entityType === "items" && (
        <Card sx={{ mb: 4, boxShadow: 2, borderRadius: 2, border: 1, borderColor: "divider" }}>
          <CardContent sx={{ p: 0 }}>
            <Box sx={{ p: { xs: 2, sm: 3 }, pb: 2, borderBottom: 1, borderColor: "divider", bgcolor: "action.hover" }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="h6" sx={{ fontWeight: 600, color: "primary.main" }}>
                  Item Details
                </Typography>
                {!canEdit && (() => {
                  const item = entityData as { type?: string | null; slot?: string | null; costGp?: string | null; weight?: string | null } | undefined;
                  return item ? (
                    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                      {item.type && <Chip label={item.type} size="small" color="secondary" variant="filled" sx={{ fontWeight: 600 }} />}
                      {item.slot && <Chip label={item.slot} size="small" color="info" variant="outlined" />}
                      {item.costGp && <Chip label={`${item.costGp} gp`} size="small" variant="outlined" />}
                      {item.weight && <Chip label={`${item.weight} lb`} size="small" variant="outlined" />}
                    </Box>
                  ) : null;
                })()}
              </Box>
            </Box>
            <Box sx={{ p: { xs: 2, sm: 3 } }}>
              {canEdit ? (
                <form onSubmit={itemForm.handleSubmit((data) => updateItemMutation.mutate(data))}>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <ItemFormFields form={itemForm} rulesetId={id!} />
                    <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                      <Button type="submit" variant="contained" disabled={!itemForm.formState.isDirty || updateItemMutation.isPending}>
                        <DiceSpinner size="small" loading={updateItemMutation.isPending}>Save</DiceSpinner>
                      </Button>
                    </Box>
                  </Box>
                </form>
              ) : (
                <Typography
                  variant="body1"
                  sx={{
                    color: "text.secondary",
                    lineHeight: 1.6
                  }}>
                  {(entityData as { description?: string })?.description || "No description provided."}
                </Typography>
              )}
            </Box>
          </CardContent>
        </Card>
      )}
      {/* Spell Details Card */}
      {entityType === "powers" && (
        <Card sx={{ mb: 4, boxShadow: 2, borderRadius: 2, border: 1, borderColor: "divider" }}>
          <CardContent sx={{ p: 0 }}>
            <Box sx={{ p: { xs: 2, sm: 3 }, pb: 2, borderBottom: 1, borderColor: "divider", bgcolor: "action.hover" }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="h6" sx={{ fontWeight: 600, color: "primary.main" }}>
                  Spell Details
                </Typography>
                {!canEdit && (() => {
                  const spell = entityData as { saveId?: string | null; saveEffect?: string | null } | undefined;
                  const saveName = spell?.saveId ? saves.find((s) => s.id === spell.saveId)?.name : null;
                  return (
                    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                      {selectedSpellAptitudes.map((apt) => (
                        <Chip key={apt.id} label={apt.name} size="small" color="primary" variant="outlined" />
                      ))}
                      {saveName && <Chip label={`Save: ${saveName}${spell?.saveEffect ? ` (${spell.saveEffect})` : ""}`} size="small" color="warning" variant="outlined" />}
                    </Box>
                  );
                })()}
              </Box>
            </Box>
            <Box sx={{ p: { xs: 2, sm: 3 } }}>
              {canEdit ? (
                <form onSubmit={spellForm.handleSubmit((data) => updateSpellMutation.mutate({
                  ...data,
                  aptitudes: selectedSpellAptitudes.map((a) => ({
                    id: a.id,
                    ...spellAptitudeMetadata.get(a.id),
                  })),
                }))}>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <SpellFormFields
                      form={spellForm}
                      rulesetId={id!}
                      selectedAptitudes={selectedSpellAptitudes}
                      onAptitudesChange={setSelectedSpellAptitudes}
                      aptitudeMetadata={spellAptitudeMetadata}
                      onAptitudeMetadataChange={setSpellAptitudeMetadata}
                      saves={saves}
                      hideProperties
                    />
                    <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                      <Button type="submit" variant="contained" disabled={!isSpellDirty || updateSpellMutation.isPending}>
                        <DiceSpinner size="small" loading={updateSpellMutation.isPending}>Save</DiceSpinner>
                      </Button>
                    </Box>
                  </Box>
                </form>
              ) : (
                <Typography
                  variant="body1"
                  sx={{
                    color: "text.secondary",
                    lineHeight: 1.6
                  }}>
                  {(entityData as { description?: string })?.description || "No description provided."}
                </Typography>
              )}
            </Box>
          </CardContent>
        </Card>
      )}
      {/* Class Level Details Card */}
      {entityType === "klass_levels" && (
        <Card sx={{ mb: 4, boxShadow: 2, borderRadius: 2, border: 1, borderColor: "divider" }}>
          <CardContent sx={{ p: 0 }}>
            <Box sx={{ p: { xs: 2, sm: 3 }, pb: 2, borderBottom: 1, borderColor: "divider", bgcolor: "action.hover" }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="h6" sx={{ fontWeight: 600, color: "primary.main" }}>
                  Class Level Details
                </Typography>
                {!canEdit && (
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                    {Object.entries(levelSaveValues).map(([saveId, base]) => {
                      const saveName = saves.find((s) => s.id === saveId)?.name;
                      return saveName ? <Chip key={saveId} label={`${saveName}: +${base}`} size="small" variant="outlined" /> : null;
                    })}
                  </Box>
                )}
              </Box>
            </Box>
            <Box sx={{ p: { xs: 2, sm: 3 } }}>
              {canEdit ? (
                <form onSubmit={classLevelForm.handleSubmit(() => updateClassLevelMutation.mutate())}>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {saves.length > 0 && (
                      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: `repeat(${Math.min(saves.length, 3)}, 1fr)` }, gap: 2 }}>
                        {saves.map((save) => (
                          <TextField
                            key={save.id}
                            label={`${save.name} Save`}
                            type="number"
                            slotProps={{ htmlInput: { min: 0, max: 12 } }}
                            value={levelSaveValues[save.id] ?? 0}
                            onChange={(e) => setLevelSaveValues((prev) => ({
                              ...prev,
                              [save.id]: Number(e.target.value),
                            }))}
                          />
                        ))}
                      </Box>
                    )}
                    <Autocomplete
                      multiple
                      options={featOptions}
                      getOptionLabel={(option) => option.label}
                      value={selectedLevelFeats}
                      onChange={(_, newValue) => setSelectedLevelFeats(newValue)}
                      isOptionEqualToValue={(option, value) =>
                        option.featId === value.featId && option.aptitudeId === value.aptitudeId
                      }
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Feats"
                          placeholder="Select feats with aptitudes granted at this level"
                        />
                      )}
                      renderValue={(value, getItemProps) =>
                        value.map((option, index) => {
                          const tagProps = getItemProps({ index });
                          return (
                            <Chip
                              variant="outlined"
                              label={option.label}
                              {...tagProps}
                              onDelete={() => {
                                setSelectedLevelFeats((prev) => prev.filter((_, i) => i !== index));
                              }}
                              key={`${option.featId}-${option.aptitudeId}`}
                            />
                          );
                        })
                      }
                    />
                    <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                      <Button type="submit" variant="contained" disabled={!isClassLevelDirty || updateClassLevelMutation.isPending}>
                        <DiceSpinner size="small" loading={updateClassLevelMutation.isPending}>Save</DiceSpinner>
                      </Button>
                    </Box>
                  </Box>
                </form>
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {selectedLevelFeats.length > 0 && (
                    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                      {selectedLevelFeats.map((feat) => (
                        <Chip key={`${feat.featId}-${feat.aptitudeId}`} label={feat.label} size="small" variant="outlined" />
                      ))}
                    </Box>
                  )}
                  {selectedLevelFeats.length === 0 && (
                    <Typography variant="body2" sx={{
                      color: "text.secondary"
                    }}>No feats at this level.</Typography>
                  )}
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>
      )}
      <Box
        sx={{
          borderRadius: 2,
          bgcolor: "action.hover",
          p: 1,
          mb: 4,
        }}
      >
        <Tabs
          value={currentTabValue}
          onChange={handleTabChange}
          aria-label="customization tabs"
          variant="scrollable"
          scrollButtons="auto"
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
          }}
        >
          {currentTabConfig.map((tab) => (
            <Tab
              key={tab.key}
              icon={<tab.icon />}
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  {tab.label}
                  {tab.helpIcon}
                </Box>
              }
              iconPosition="start"
            />
          ))}
        </Tabs>
      </Box>
      <Box sx={{ width: "100%" }}>
        {id && entityType && entityId &&
          currentTabConfig.map((tab, index) => (
            <TabPanel key={tab.key} value={currentTabValue} index={index}>
              {tab.component === RequirementsSection
                ? (
                  <RequirementsSection
                    ruleset={ruleset}
                    entityType={entityType as EntityType}
                    entityId={entityId}
                    data={undefined}
                    queryKeysToInvalidate={[queryKeys.rulesets.entity(id, entityType, entityId)]}
                    onEntityIdChange={handleEntityIdChange}
                  />
                )
                : tab.component === ModifiersSection
                ? (
                  <ModifiersSection
                    ruleset={ruleset}
                    entityType={entityType as BaseEntityType}
                    entityId={entityId}
                    data={undefined}
                    queryKeysToInvalidate={[queryKeys.rulesets.entity(id, entityType, entityId)]}
                    onEntityIdChange={handleEntityIdChange}
                  />
                )
                : (
                  <PropertiesSection
                    ruleset={ruleset}
                    entityType={entityType as BaseEntityType}
                    entityId={entityId}
                    data={"properties" in entityData ? (entityData as Record<string, unknown>).properties as Property[] : undefined}
                    queryKeysToInvalidate={entityType === "klass_levels" && "klassId" in entityData
                      ? [
                        queryKeys.rulesets.entity(id, entityType, entityId),
                        queryKeys.rulesets.classLevels(id, (entityData as { klassId: string }).klassId),
                      ]
                      : [queryKeys.rulesets.entity(id, entityType, entityId)]}
                    onEntityIdChange={handleEntityIdChange}
                  />
                )}
            </TabPanel>
          ))}
      </Box>
      <DeleteDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        title={`Delete ${entityType_LABELS[entityType as EntityType] ?? "Entity"}`}
        message={`Are you sure you want to delete this ${(entityType_LABELS[entityType as EntityType] ?? "entity").toLowerCase()}? This action cannot be undone.`}
        onConfirm={() => deleteMutation.mutate()}
        isLoading={deleteMutation.isPending}
      />
    </Container>
  );
}
