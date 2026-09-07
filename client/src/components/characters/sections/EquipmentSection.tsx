import {
  AnimatedAlert,
  BlankState,
  CreateDialog,
  DeleteDialog,
  EditDialog,
  DiceSpinner,
  ScrollSafeListbox,
} from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { useDebouncedValue } from "@/client/src/hooks/index.ts";
import { formatDecimal } from "@/client/src/lib/formatNumeric.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import {
  ApiError,
  type ApiValidationIssue,
  type RPC,
  rpc,
} from "@/client/src/services/rpc.ts";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
} from "@mui/icons-material";
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  Link as MuiLink,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link } from "react-router-dom";

const LOCATION_VALUES = [
  "Head",
  "Neck",
  "Shoulders",
  "Torso",
  "Wrists",
  "Hands",
  "Waist",
  "Finger",
  "Trinket",
  "Main Hand",
  "Off Hand",
  "Two Handed",
  "Other",
] as const;

type LocationValue = (typeof LOCATION_VALUES)[number];

type ItemsResponse = InferResponseType<
  RPC["api"]["rulesets"][":id"]["items"]["$get"]
>;
type ItemsPaginated = Exclude<ItemsResponse, { error: string }>;
type SearchItem = ItemsPaginated["items"][number];

type ItemDetailResponse = InferResponseType<
  RPC["api"]["rulesets"][":id"]["items"][":itemId"]["$get"]
>;
type ItemDetail = Exclude<ItemDetailResponse, { error: string }>;

type InventoryResponse = InferResponseType<
  RPC["api"]["characters"]["inventory"][":characterId"]["$get"]
>;
type InventoryItems = Exclude<InventoryResponse, { error: string }>;
type InventoryEntry = InventoryItems[number];

interface EncumbranceData {
  carriedweight?: number;
  lightload?: number;
  mediumload?: number;
  heavyload?: number;
  load?: string;
}

interface EquipmentSectionProps {
  characterId: string;
  rulesetId: string;
  isArchived: boolean;
  isCustomRuleset?: boolean;
  encumbrance?: EncumbranceData;
}

const HAND_SLOTS = new Set<LocationValue>(["Main Hand", "Off Hand", "Two Handed"]);

const SINGLE_OCCUPANCY_SLOTS = new Set<LocationValue>([
  "Head", "Neck", "Shoulders", "Torso", "Wrists",
  "Hands", "Waist", "Trinket",
]);

interface AddItemFormData {
  selectedItem: SearchItem | null;
  quantity: number;
  equipped: boolean;
  location: LocationValue | "none";
  weaponSet: number;
  totalCharges: number;
  remainingCharges: number;
}

interface EditItemFormData {
  quantity: number;
  equipped: boolean;
  location: LocationValue | "none";
  weaponSet: number;
  totalCharges: number;
  remainingCharges: number;
}

type ItemColumns = { type: string | null; slot: string };
type ItemProperties = { type: string; value: string }[];

function detectSlotFromItem(item: ItemColumns): LocationValue | null {
  if (item.type === "Weapon") return null; // hand slot picker
  if (item.type === "Armor") return "Torso";
  if (item.type === "Shield") return "Off Hand";
  const match = LOCATION_VALUES.find((v) => v.toLowerCase() === item.slot.toLowerCase());
  if (match) return match;
  return null;
}

function isWeaponItem(item: ItemColumns): boolean {
  return item.type === "Weapon";
}

function isShieldItem(item: ItemColumns): boolean {
  return item.type === "Shield";
}

function isEquipableItem(_item: ItemColumns): boolean {
  return true;
}

function isSlotlessEquipable(_item: ItemColumns): boolean {
  return false;
}

function hasChargesProperty(properties: ItemProperties): { has: boolean; defaultCount: number } {
  const prop = properties.find((p) => p.type === "ITEM_HAS_CHARGES");
  if (!prop) return { has: false, defaultCount: 0 };
  return { has: true, defaultCount: Number.parseInt(prop.value, 10) || 0 };
}

function getSlotConflictWarning(
  location: LocationValue | "none",
  weaponSet: number,
  inventoryItems: InventoryEntry[],
  excludeItemId?: string,
): string | null {
  if (!location || location === "none") return null;

  const equipped = inventoryItems.filter(
    (e) => e.equipped && e.location && e.itemId !== excludeItemId,
  );

  if (SINGLE_OCCUPANCY_SLOTS.has(location)) {
    const conflict = equipped.find((e) => e.location === location);
    if (conflict) {
      return `${location} slot is occupied by ${conflict.item.name}`;
    }
  }

  if (location === "Finger") {
    const fingerCount = equipped.filter((e) => e.location === "Finger").length;
    if (fingerCount >= 2) {
      return "Both finger slots are occupied";
    }
  }

  if (HAND_SLOTS.has(location)) {
    const sameSet = equipped.filter(
      (e) => HAND_SLOTS.has(e.location as LocationValue) && e.weaponSet === weaponSet,
    );

    if (location === "Two Handed") {
      const conflict = sameSet.find(
        (e) => e.location === "Main Hand" || e.location === "Off Hand",
      );
      if (conflict) {
        return `Cannot equip two-handed: ${conflict.item.name} is in ${conflict.location} (Set ${weaponSet})`;
      }
    }

    if (location === "Main Hand" || location === "Off Hand") {
      const twoHanded = sameSet.find((e) => e.location === "Two Handed");
      if (twoHanded) {
        return `Cannot equip: ${twoHanded.item.name} is two-handed in Set ${weaponSet}`;
      }
      const sameSlot = sameSet.find((e) => e.location === location);
      if (sameSlot) {
        return `${location} is occupied by ${sameSlot.item.name} (Set ${weaponSet})`;
      }
    }
  }

  return null;
}

function formatSlotDisplay(entry: InventoryEntry): string {
  if (!entry.equipped || !entry.location) return "\u2014";
  if (HAND_SLOTS.has(entry.location as LocationValue) && entry.weaponSet !== null) {
    return `${entry.location} (Set ${entry.weaponSet})`;
  }
  return entry.location;
}

export function EquipmentSection({
  characterId,
  rulesetId,
  isArchived,
  isCustomRuleset,
  encumbrance,
}: EquipmentSectionProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const { data: inventoryItems = [] } = useQuery({
    queryKey: queryKeys.characters.inventory(characterId),
    queryFn: async () => {
      const response = await rpc.api.characters.inventory[":characterId"].$get({
        param: { characterId },
      });
      if (!response.ok) throw new Error("Failed to fetch inventory");
      return response.json();
    },
  });

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ApiValidationIssue[]>([]);
  const [editingEntry, setEditingEntry] = useState<InventoryEntry | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [itemSearch, setItemSearch] = useState("");
  const debouncedItemSearch = useDebouncedValue(itemSearch);

  const addForm = useForm<AddItemFormData>({
    defaultValues: {
      selectedItem: null,
      quantity: 1,
      equipped: false,
      location: "none",
      weaponSet: 0,
      totalCharges: 0,
      remainingCharges: 0,
    },
  });

  const editForm = useForm<EditItemFormData>({
    defaultValues: {
      quantity: 1,
      equipped: false,
      location: "none",
      weaponSet: 0,
      totalCharges: 0,
      remainingCharges: 0,
    },
  });

  const selectedItem = addForm.watch("selectedItem");
  const addLocation = addForm.watch("location");
  const addWeaponSet = addForm.watch("weaponSet");
  const editLocation = editForm.watch("location");
  const editWeaponSet = editForm.watch("weaponSet");

  // Fetch item details when an item is selected in the add dialog
  const { data: itemDetail } = useQuery({
    queryKey: queryKeys.characters.rulesetItem(rulesetId, selectedItem?.id ?? ""),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].items[":itemId"].$get({
        param: { id: rulesetId, itemId: selectedItem!.id },
      });
      if (!response.ok) throw new Error("Failed to fetch item details");
      return response.json() as Promise<ItemDetail>;
    },
    enabled: !!selectedItem,
  });

  const addItemProperties = useMemo(
    () => (itemDetail && "properties" in itemDetail ? itemDetail.properties : []),
    [itemDetail],
  );

  const addItemColumns: ItemColumns = useMemo(
    () => ({ type: itemDetail?.type ?? null, slot: itemDetail?.slot ?? "Other" }),
    [itemDetail],
  );

  const addIsWeapon = useMemo(() => isWeaponItem(addItemColumns), [addItemColumns]);
  const addIsShield = useMemo(() => isShieldItem(addItemColumns), [addItemColumns]);
  const addIsArmor = useMemo(() => addItemColumns.type === "Armor", [addItemColumns]);
  const addIsEquipable = useMemo(() => isEquipableItem(addItemColumns), [addItemColumns]);
  const addIsSlotless = useMemo(() => isSlotlessEquipable(addItemColumns), [addItemColumns]);
  const addChargesInfo = useMemo(() => hasChargesProperty(addItemProperties), [addItemProperties]);
  const addShowHandPicker = addIsWeapon;
  const addShowWeaponSet = addIsWeapon || addIsShield;

  // Auto-detect slot when item details load (add dialog)
  useEffect(() => {
    if (!itemDetail) return;
    const detected = detectSlotFromItem(addItemColumns);
    if (detected) {
      addForm.setValue("location", detected);
    } else if (!addIsWeapon) {
      addForm.setValue("location", "none");
    }
    // Auto-fill charges
    if (addChargesInfo.has) {
      addForm.setValue("totalCharges", addChargesInfo.defaultCount);
      addForm.setValue("remainingCharges", addChargesInfo.defaultCount);
    }
  }, [itemDetail, addItemColumns, addIsWeapon, addChargesInfo, addForm]);

  // Edit dialog properties from the inventory entry
  const editItemProperties = useMemo(
    () => editingEntry?.item.properties ?? [],
    [editingEntry],
  );
  const editItemColumns: ItemColumns = useMemo(
    () => ({ type: editingEntry?.item.type ?? null, slot: editingEntry?.item.slot ?? "Other" }),
    [editingEntry],
  );
  const editIsWeapon = useMemo(() => isWeaponItem(editItemColumns), [editItemColumns]);
  const editIsShield = useMemo(() => isShieldItem(editItemColumns), [editItemColumns]);
  const editIsArmor = useMemo(() => editItemColumns.type === "Armor", [editItemColumns]);
  const editIsEquipable = useMemo(() => isEquipableItem(editItemColumns), [editItemColumns]);
  const editIsSlotless = useMemo(() => isSlotlessEquipable(editItemColumns), [editItemColumns]);
  const editChargesInfo = useMemo(() => hasChargesProperty(editItemProperties), [editItemProperties]);
  const editShowHandPicker = editIsWeapon;
  const editShowWeaponSet = editIsWeapon || editIsShield;

  // Slot conflict warnings
  const addSlotWarning = useMemo(
    () => getSlotConflictWarning(addLocation as LocationValue | "none", addWeaponSet, inventoryItems),
    [addLocation, addWeaponSet, inventoryItems],
  );

  const editSlotWarning = useMemo(
    () => getSlotConflictWarning(
      editLocation as LocationValue | "none",
      editWeaponSet,
      inventoryItems,
      editingEntry?.itemId,
    ),
    [editLocation, editWeaponSet, inventoryItems, editingEntry],
  );

  // Item search infinite query
  const {
    data: searchData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingSearch,
  } = useInfiniteQuery({
    queryKey: queryKeys.characters.itemSearch(rulesetId, debouncedItemSearch),
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.rulesets[":id"].items.$get({
        param: { id: rulesetId },
        query: {
          page: pageParam.toString(),
          limit: "10",
          search: debouncedItemSearch || undefined,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch items");
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: addDialogOpen,
  });

  const searchItems = searchData?.pages.flatMap((page) => page.items) ?? [];

  const handleItemsScroll = (event: React.UIEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const bottom =
      target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
    if (bottom && hasNextPage && !isFetchingNextPage) {
      (target as unknown as Record<string, () => void>).__lockScroll?.();
      fetchNextPage();
    }
  };

  // Mutations
  const addMutation = useMutation({
    mutationFn: async ({ data, force = false }: { data: AddItemFormData; force?: boolean }) => {
      if (!data.selectedItem) throw new Error("No item selected");
      const location = data.location && data.location !== "none" ? data.location : null;
      const equipped = !!location;
      return rpc.api.characters.inventory[":characterId"].$post({
        param: { characterId },
        json: {
          itemId: data.selectedItem.id,
          quantity: data.quantity,
          equipped,
          location,
          totalCharges: addChargesInfo.has ? data.totalCharges : null,
          remainingCharges: addChargesInfo.has ? data.remainingCharges : null,
          weaponSet: location && HAND_SLOTS.has(location as LocationValue) ? data.weaponSet : null,
          force,
        },
      });
    },
    onSuccess: () => {
      snackbar.success("Item added to inventory");
      queryClient.invalidateQueries({
        queryKey: queryKeys.characters.detail(characterId),
      });
      setAddDialogOpen(false);
      addForm.reset();
      setItemSearch("");
      setValidationErrors([]);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.issues && error.issues.length > 0) {
        setValidationErrors(error.issues);
      } else {
        snackbar.error(error);
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      itemId,
      data,
      force = false,
    }: {
      itemId: string;
      data: EditItemFormData;
      force?: boolean;
    }) => {
      const location = data.location && data.location !== "none" ? data.location : null;
      const equipped = !!location;
      return rpc.api.characters.inventory[":characterId"][":itemId"].$put({
        param: { characterId, itemId },
        json: {
          quantity: data.quantity,
          equipped,
          location,
          totalCharges: editChargesInfo.has ? data.totalCharges : null,
          remainingCharges: editChargesInfo.has ? data.remainingCharges : null,
          weaponSet: location && HAND_SLOTS.has(location as LocationValue) ? data.weaponSet : null,
          force,
          updatedAt: editingEntry?.updatedAt,
        },
      });
    },
    onSuccess: () => {
      snackbar.success("Item updated");
      queryClient.invalidateQueries({
        queryKey: queryKeys.characters.detail(characterId),
      });
      setEditDialogOpen(false);
      setEditingEntry(null);
      editForm.reset();
      setValidationErrors([]);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.issues && error.issues.length > 0) {
        setValidationErrors(error.issues);
      } else {
        snackbar.error(error);
      }
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return rpc.api.characters.inventory[":characterId"][":itemId"].$delete({
        param: { characterId, itemId },
      });
    },
    onSuccess: () => {
      snackbar.success("Item removed from inventory");
      queryClient.invalidateQueries({
        queryKey: queryKeys.characters.detail(characterId),
      });
      setDeleteDialogOpen(false);
      setDeletingItemId(null);
    },
    onError: (error) => {
      snackbar.error(error);
    },
  });

  const handleEditItem = (entry: InventoryEntry) => {
    setEditingEntry(entry);
    editForm.reset({
      quantity: entry.quantity ?? 1,
      equipped: entry.equipped ?? false,
      location: (entry.location as LocationValue) || "none",
      weaponSet: entry.weaponSet ?? 0,
      totalCharges: entry.totalCharges ?? 0,
      remainingCharges: entry.remainingCharges ?? 0,
    });
    setEditDialogOpen(true);
  };

  const handleDeleteItem = (itemId: string) => {
    setDeletingItemId(itemId);
    setDeleteDialogOpen(true);
  };

  // Determine which location options to show in add dialog
  const addLocationOptions = useMemo(() => {
    if (addShowHandPicker) return (["Main Hand", "Off Hand", "Two Handed"] as const).slice();
    if (addIsShield) return ["Off Hand" as const];
    if (addIsArmor) return ["Torso" as const];
    if (addItemColumns.slot === "Other") return ["Other" as const];
    return LOCATION_VALUES;
  }, [addShowHandPicker, addIsShield, addIsArmor, addItemColumns.slot]);

  const editLocationOptions = useMemo(() => {
    if (editShowHandPicker) return (["Main Hand", "Off Hand", "Two Handed"] as const).slice();
    if (editIsShield) return ["Off Hand" as const];
    if (editIsArmor) return ["Torso" as const];
    if (editItemColumns.slot === "Other") return ["Other" as const];
    return LOCATION_VALUES;
  }, [editShowHandPicker, editIsShield, editIsArmor, editItemColumns.slot]);

  const requirementAlert = (visible: boolean, onForce?: () => void) => visible ? (
    <AnimatedAlert
      in
      severity="warning"
      onClose={() => setValidationErrors([])}
      action={
        onForce && (
          <Button
            size="small"
            variant="outlined"
            color="warning"
            onClick={() => {
              setValidationErrors([]);
              onForce();
            }}
            disabled={addMutation.isPending || updateMutation.isPending}
            sx={{ whiteSpace: "nowrap" }}
          >
            Proceed Anyway
          </Button>
        )
      }
      sx={{ mb: 0, "& .MuiAlert-action": { alignItems: "flex-start", pt: 0.5 } }}
    >
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        Equipment warnings
      </Typography>
      <Box component="ul" sx={{ m: 0, pl: 2, maxWidth: "100%", overflow: "hidden" }}>
        {validationErrors.map((issue, i) => (
          <li key={i}>
            {issue.entityName && (
              <Typography
                component="span"
                variant="body2"
                sx={{ fontWeight: "bold" }}
              >
                {issue.entityName}
                {issue.entityType ? ` (${issue.entityType})` : ""}
                {": "}
              </Typography>
            )}
            <Typography component="span" variant="body2">
              {issue.message}
            </Typography>
            {issue.requirementTree && (
              <Typography
                component="pre"
                variant="caption"
                sx={{
                  mt: 0.5,
                  whiteSpace: "pre-wrap",
                  fontFamily: "monospace",
                  bgcolor: "action.hover",
                  p: 0.5,
                  borderRadius: 0.5,
                  maxWidth: "100%",
                  overflow: "auto",
                }}
              >
                {issue.requirementTree}
              </Typography>
            )}
          </li>
        ))}
      </Box>
    </AnimatedAlert>
  ) : null;

  const hasItems = inventoryItems.length > 0;

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        sx={{
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", sm: "center" },
          mb: 3
        }}>
        <Typography
          sx={{ fontWeight: 600, color: "primary.main", typography: { xs: "h6", sm: "h5" } }}
        >
          Equipment & Inventory
        </Typography>
        {!isArchived && hasItems && (
          <Stack direction="row" spacing={1}>
            {isCustomRuleset && (
              <Button
                variant="outlined"
                size="small"
                component={Link}
                to={`/rulesets/${rulesetId}/items`}
                target="_blank"
              >
                Create Item
              </Button>
            )}
            <Button
              variant="contained"
              size="small"
              onClick={() => setAddDialogOpen(true)}
            >
              Add Item
            </Button>
          </Stack>
        )}
      </Stack>
      {hasItems ? (
        <>
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "grey.100" }}>
                  <TableCell sx={{ fontWeight: 600 }}>Item</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>
                    Slot
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>
                    Quantity
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>
                    Weight
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>
                    Value
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                  {!isArchived && (
                    <TableCell align="center" sx={{ fontWeight: 600 }}>
                      Actions
                    </TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {inventoryItems.map((entry) => (
                  <TableRow
                    key={entry.itemId}
                    sx={entry.equipped ? { backgroundColor: "action.hover" } : {}}
                  >
                    <TableCell>
                      <MuiLink
                        component={Link}
                        to={`/rulesets/${rulesetId}/items/${entry.item.id}/customization`}
                        target="_blank"
                        underline="hover"
                      >
                        {entry.item.name || "Unknown Item"}
                      </MuiLink>
                      {entry.totalCharges !== null &&
                        entry.totalCharges !== undefined && (
                          <Typography
                            variant="caption"
                            sx={{ display: "block", color: "text.secondary" }}
                          >
                            Charges: {entry.remainingCharges ?? 0}/
                            {entry.totalCharges}
                          </Typography>
                        )}
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2">
                        {formatSlotDisplay(entry)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">{entry.quantity || 1}</TableCell>
                    <TableCell align="center">
                      {(() => {
                        const w = formatDecimal(entry.item.weight);
                        return w ? `${w} lbs` : "\u2014";
                      })()}
                    </TableCell>
                    <TableCell align="center">
                      {(() => {
                        const c = formatDecimal(entry.item.costGp);
                        return c ? `${c} gp` : "\u2014";
                      })()}
                    </TableCell>
                    <TableCell sx={{ fontSize: "0.875rem" }}>
                      {entry.item.description || "\u2014"}
                    </TableCell>
                    {!isArchived && (
                      <TableCell align="center">
                        <Stack direction="row" spacing={0} sx={{
                          justifyContent: "center"
                        }}>
                          <IconButton
                            size="small"
                            onClick={() => handleEditItem(entry)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteItem(entry.itemId)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {encumbrance && (
            <Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 500, color: "text.secondary" }}>
                Carried Weight: {encumbrance.carriedweight ?? 0} lbs
              </Typography>
              <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>
                Light: {encumbrance.lightload ?? 0}
              </Typography>
              <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>
                Medium: {encumbrance.mediumload ?? 0}
              </Typography>
              <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>
                Heavy: {encumbrance.heavyload ?? 0}
              </Typography>
              {encumbrance.load && encumbrance.load !== "light" && (
                <Chip
                  label={encumbrance.load.charAt(0).toUpperCase() + encumbrance.load.slice(1)}
                  size="small"
                  color={
                    encumbrance.load === "overloaded" ? "error"
                      : encumbrance.load === "heavy" ? "warning"
                      : "info"
                  }
                />
              )}
            </Box>
          )}
        </>
      ) : (
        <BlankState
          title="No equipment"
          description="Add items to this character's inventory."
          action={
            !isArchived ? (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setAddDialogOpen(true)}
              >
                Add Item
              </Button>
            ) : undefined
          }
        />
      )}
      {/* Add Item Dialog */}
      <CreateDialog
        open={addDialogOpen}
        onClose={() => {
          setAddDialogOpen(false);
          addForm.reset();
          setItemSearch("");
          setValidationErrors([]);
        }}
        title="Add Item to Inventory"
        form={addForm}
        onSubmit={(data) => addMutation.mutate({ data })}
        isLoading={addMutation.isPending}
        maxWidth="md"
      >
        {requirementAlert(
          validationErrors.length > 0 && addDialogOpen,
          () => addMutation.mutate({ data: addForm.getValues(), force: true }),
        )}
        {addSlotWarning && <AnimatedAlert in severity="warning">{addSlotWarning}</AnimatedAlert>}
        <Controller
          name="selectedItem"
          control={addForm.control}
          rules={{ required: "Item is required" }}
          render={({ field, fieldState }) => (
            <Autocomplete
              options={searchItems}
              filterOptions={(x) => x}
              getOptionLabel={(option) => option.name}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              value={field.value}
              onChange={(_, newValue) => {
                field.onChange(newValue);
                if (!newValue) {
                  addForm.setValue("location", "none");
                  addForm.setValue("totalCharges", 0);
                  addForm.setValue("remainingCharges", 0);
                }
              }}
              onInputChange={(_, value, reason) => {
                if (reason === "input") setItemSearch(value);
              }}
              loading={isLoadingSearch}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Search Item"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  slotProps={{
                    ...params.slotProps,

                    input: {
                      ...params.slotProps.input,
                      endAdornment: (
                        <>
                          {isLoadingSearch ? (
                            <DiceSpinner size="small" />
                          ) : null}
                          {params.slotProps.input.endAdornment}
                        </>
                      ),
                    }
                  }}
                />
              )}
              renderOption={(props, option) => (
                <Box component="li" {...props} key={option.id}>
                  <Box>
                    <Typography variant="body2">{option.name}</Typography>
                    {(() => {
                      const c = formatDecimal(option.costGp);
                      const w = formatDecimal(option.weight);
                      if (!c) return null;
                      return (
                        <Typography variant="caption" sx={{
                          color: "text.secondary"
                        }}>
                          {c}gp{w ? ` | ${w} lbs` : ""}
                        </Typography>
                      );
                    })()}
                  </Box>
                </Box>
              )}
              fullWidth
              slotProps={{
                listbox: {
                  component: ScrollSafeListbox,

                  ...{
                    onScroll: handleItemsScroll,
                    style: { maxHeight: 300 },
                  }
                }
              }} />
          )}
        />
        <TextField
          {...addForm.register("quantity", {
            valueAsNumber: true,
            min: { value: 1, message: "Minimum 1" },
          })}
          label="Quantity"
          type="number"
          fullWidth
          error={!!addForm.formState.errors.quantity}
          helperText={addForm.formState.errors.quantity?.message}
          slotProps={{
            htmlInput: { min: 1 }
          }}
        />
        {selectedItem && addIsEquipable && addIsSlotless && (
          <FormControlLabel
            control={
              <Checkbox
                checked={addForm.watch("equipped")}
                onChange={(e) => addForm.setValue("equipped", e.target.checked)}
              />
            }
            label="Equipped"
          />
        )}
        {selectedItem && addIsEquipable && !addIsSlotless && (
          <>
            <TextField
              select
              label={addShowHandPicker ? "Hand Slot" : "Equipment Slot"}
              value={addForm.watch("location")}
              onChange={(e) =>
                addForm.setValue("location", e.target.value as LocationValue | "none")}
              fullWidth
            >
              <MenuItem value="none">Not Equipped</MenuItem>
              {addLocationOptions.map((loc) => (
                <MenuItem key={loc} value={loc}>
                  {loc}
                </MenuItem>
              ))}
            </TextField>
            {addLocation && addShowWeaponSet && HAND_SLOTS.has(addLocation as LocationValue) && (
              <TextField
                {...addForm.register("weaponSet", { valueAsNumber: true })}
                label="Weapon Set"
                type="number"
                fullWidth
                slotProps={{
                  htmlInput: { min: 0 }
                }}
              />
            )}
          </>
        )}
        {addChargesInfo.has && (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              {...addForm.register("totalCharges", { valueAsNumber: true })}
              label="Total Charges"
              type="number"
              fullWidth
              slotProps={{
                htmlInput: { min: 0 }
              }}
            />
            <TextField
              {...addForm.register("remainingCharges", {
                valueAsNumber: true,
              })}
              label="Remaining Charges"
              type="number"
              fullWidth
              slotProps={{
                htmlInput: { min: 0 }
              }}
            />
          </Stack>
        )}
      </CreateDialog>
      {/* Edit Item Dialog */}
      <EditDialog
        open={editDialogOpen}
        onClose={() => {
          setEditDialogOpen(false);
          setEditingEntry(null);
          editForm.reset();
          setValidationErrors([]);
        }}
        title="Edit Inventory Item"
        form={editForm}
        onSubmit={(data) =>
          editingEntry && updateMutation.mutate({ itemId: editingEntry.itemId, data })}
        isLoading={updateMutation.isPending}
        maxWidth="md"
      >
        {requirementAlert(
          validationErrors.length > 0 && editDialogOpen,
          editingEntry
            ? () => updateMutation.mutate({ itemId: editingEntry.itemId, data: editForm.getValues(), force: true })
            : undefined,
        )}
        {editSlotWarning && <AnimatedAlert in severity="warning">{editSlotWarning}</AnimatedAlert>}
        <TextField
          label="Item"
          value={editingEntry?.item.name ?? ""}
          fullWidth
          disabled
        />
        <TextField
          {...editForm.register("quantity", {
            valueAsNumber: true,
            min: { value: 1, message: "Minimum 1" },
          })}
          label="Quantity"
          type="number"
          fullWidth
          error={!!editForm.formState.errors.quantity}
          helperText={editForm.formState.errors.quantity?.message}
          slotProps={{
            htmlInput: { min: 1 }
          }}
        />
        {editIsEquipable && editIsSlotless && (
          <FormControlLabel
            control={
              <Checkbox
                checked={editForm.watch("equipped")}
                onChange={(e) => editForm.setValue("equipped", e.target.checked)}
              />
            }
            label="Equipped"
          />
        )}
        {editIsEquipable && !editIsSlotless && (
          <>
            <TextField
              select
              label={editShowHandPicker ? "Hand Slot" : "Equipment Slot"}
              value={editForm.watch("location")}
              onChange={(e) =>
                editForm.setValue("location", e.target.value as LocationValue | "none")}
              fullWidth
            >
              <MenuItem value="none">Not Equipped</MenuItem>
              {editLocationOptions.map((loc) => (
                <MenuItem key={loc} value={loc}>
                  {loc}
                </MenuItem>
              ))}
            </TextField>
            {editLocation && editShowWeaponSet && HAND_SLOTS.has(editLocation as LocationValue) && (
              <TextField
                {...editForm.register("weaponSet", { valueAsNumber: true })}
                label="Weapon Set"
                type="number"
                fullWidth
                slotProps={{
                  htmlInput: { min: 0 }
                }}
              />
            )}
          </>
        )}
        {editChargesInfo.has && (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              {...editForm.register("totalCharges", { valueAsNumber: true })}
              label="Total Charges"
              type="number"
              fullWidth
              slotProps={{
                htmlInput: { min: 0 }
              }}
            />
            <TextField
              {...editForm.register("remainingCharges", {
                valueAsNumber: true,
              })}
              label="Remaining Charges"
              type="number"
              fullWidth
              slotProps={{
                htmlInput: { min: 0 }
              }}
            />
          </Stack>
        )}
      </EditDialog>
      {/* Remove Confirmation */}
      <DeleteDialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setDeletingItemId(null);
        }}
        title="Remove Item"
        message="Are you sure you want to remove this item from the inventory?"
        onConfirm={() => deletingItemId && removeMutation.mutate(deletingItemId)}
        isLoading={removeMutation.isPending}
      />
    </Paper>
  );
}
