import { oneOf } from "@/client/src/lib/oneOf.ts";
import {
  AnimatedAlert,
  BlankState,
  CreateDialog,
  DeleteDialog,
  EditDialog,
  DiceSpinner,
  ScrollSafeListbox,
  ValidationIssueList,
} from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { useDebouncedValue, useListboxQuery, useValidationIssues } from "@/client/src/hooks/index.ts";
import { formatCost, formatWeight } from "@/client/src/lib/formatNumeric.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, type RPC, rpc } from "@/client/src/services/rpc.ts";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
} from "@mui/icons-material";
import {
  Autocomplete,
  Box,
  Button,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient, skipToken } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import {
  detectSlotFromItem,
  EMPTY_INVENTORY_FORM,
  type EncumbranceData,
  getSlotConflictWarning,
  type InventoryFormData,
  type ItemColumns,
  LOCATION_CHOICES,
  placementPayload,
  placementProfile,
} from "./equipment.ts";
import { EquipmentTable } from "./EquipmentTable.tsx";
import { InventoryPlacementFields } from "./InventoryPlacementFields.tsx";
import { SheetSection } from "./SheetSection.tsx";

type InventoryItems = InferResponseType<RPC["api"]["characters"]["inventory"][":characterId"]["$get"], 200>;
type InventoryEntry = InventoryItems[number];

interface EquipmentSectionProps {
  characterId: string;
  rulesetId: string;
  isArchived: boolean;
  isCustomRuleset?: boolean;
  encumbrance?: EncumbranceData;
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
      return parseResponse(rpc.api.characters.inventory[":characterId"].$get({
        param: { characterId },
      }));
    },
  });

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { validationErrors, setValidationErrors, handleSaveError } = useValidationIssues();
  const [editingEntry, setEditingEntry] = useState<InventoryEntry | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [itemSearch, setItemSearch] = useState("");
  const debouncedItemSearch = useDebouncedValue(itemSearch);

  const addForm = useForm<InventoryFormData>({ defaultValues: EMPTY_INVENTORY_FORM });
  const editForm = useForm<InventoryFormData>({ defaultValues: EMPTY_INVENTORY_FORM });

  const selectedItem = addForm.watch("selectedItem");
  const addLocation = addForm.watch("location");
  const addWeaponSet = addForm.watch("weaponSet");
  const editLocation = editForm.watch("location");
  const editWeaponSet = editForm.watch("weaponSet");

  // Fetch item details when an item is selected in the add dialog
  const { data: itemDetail } = useQuery({
    queryKey: queryKeys.characters.rulesetItem(rulesetId, selectedItem?.id ?? ""),
    queryFn: selectedItem
      ? () => parseResponse(rpc.api.rulesets[":id"].items[":itemId"].$get({ param: { id: rulesetId, itemId: selectedItem.id } }))
      : skipToken,
  });

  const addItemProperties = useMemo(
    () => (itemDetail && "properties" in itemDetail ? itemDetail.properties : []),
    [itemDetail],
  );

  const addItemColumns: ItemColumns = useMemo(
    () => ({ type: itemDetail?.type ?? null, slot: itemDetail?.slot ?? "Other" }),
    [itemDetail],
  );

  const addProfile = useMemo(
    () => (itemDetail ? placementProfile(addItemColumns, addItemProperties) : null),
    [itemDetail, addItemColumns, addItemProperties],
  );

  // Auto-detect slot when item details load (add dialog)
  useEffect(() => {
    if (!itemDetail) return;
    const detected = detectSlotFromItem(addItemColumns);
    if (detected) {
      addForm.setValue("location", detected);
    } else if (!addProfile?.isWeapon) {
      addForm.setValue("location", "none");
    }
    // Auto-fill charges
    if (addProfile?.charges.has) {
      addForm.setValue("totalCharges", addProfile.charges.defaultCount);
      addForm.setValue("remainingCharges", addProfile.charges.defaultCount);
    }
  }, [itemDetail, addItemColumns, addProfile, addForm]);

  // Edit dialog properties from the inventory entry
  const editItemProperties = useMemo(
    () => editingEntry?.item.properties ?? [],
    [editingEntry],
  );
  const editItemColumns: ItemColumns = useMemo(
    () => ({ type: editingEntry?.item.type ?? null, slot: editingEntry?.item.slot ?? "Other" }),
    [editingEntry],
  );
  const editProfile = useMemo(
    () => placementProfile(editItemColumns, editItemProperties),
    [editItemColumns, editItemProperties],
  );

  // Slot conflict warnings
  const addSlotWarning = useMemo(
    () => getSlotConflictWarning(addLocation, addWeaponSet, inventoryItems),
    [addLocation, addWeaponSet, inventoryItems],
  );

  const editSlotWarning = useMemo(
    () => getSlotConflictWarning(
      editLocation,
      editWeaponSet,
      inventoryItems,
      editingEntry?.itemId,
    ),
    [editLocation, editWeaponSet, inventoryItems, editingEntry],
  );

  // Item search infinite query
  const {
    items: searchItems,
    isLoading: isLoadingSearch,
    onScroll: handleItemsScroll,
  } = useListboxQuery({
    queryKey: queryKeys.characters.itemSearch(rulesetId, debouncedItemSearch),
    queryFn: async ({ pageParam }) => {
      return parseResponse(rpc.api.rulesets[":id"].items.$get({
        param: { id: rulesetId },
        query: {
          page: pageParam.toString(),
          limit: "10",
          search: debouncedItemSearch || undefined,
        },
      }));
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: addDialogOpen,
  });

  // Mutations
  const addMutation = useMutation({
    mutationFn: async ({ data, force = false }: { data: InventoryFormData; force?: boolean }) => {
      if (!data.selectedItem) throw new Error("No item selected");
      return rpc.api.characters.inventory[":characterId"].$post({
        param: { characterId },
        json: { itemId: data.selectedItem.id, ...placementPayload(data, !!addProfile?.charges.has), force },
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
    onError: handleSaveError,
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      itemId,
      data,
      force = false,
    }: {
      itemId: string;
      data: InventoryFormData;
      force?: boolean;
    }) => {
      return rpc.api.characters.inventory[":characterId"][":itemId"].$put({
        param: { characterId, itemId },
        json: { ...placementPayload(data, editProfile.charges.has), force, updatedAt: editingEntry?.updatedAt },
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
    onError: handleSaveError,
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
      location: oneOf(entry.location, LOCATION_CHOICES, "none"),
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
      <ValidationIssueList issues={validationErrors} />
    </AnimatedAlert>
  ) : null;

  const hasItems = inventoryItems.length > 0;

  return (
    <SheetSection
      title="Equipment & Inventory"
      action={!isArchived && hasItems && (
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
    >
      {hasItems ? (
        <EquipmentTable
          rows={inventoryItems.map((entry) => ({
            ...entry,
            name: entry.item.name,
            description: entry.item.description,
            weight: entry.item.weight,
            costGp: entry.item.costGp,
          }))}
          encumbrance={encumbrance}
          rulesetId={rulesetId}
          renderActions={isArchived ? undefined : (entry) => (
            <Stack direction="row" spacing={0} sx={{ justifyContent: "center" }}>
              <IconButton size="small" aria-label={`Edit ${entry.name}`} onClick={() => handleEditItem(entry)}>
                <EditIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" color="error" aria-label={`Remove ${entry.name}`} onClick={() => handleDeleteItem(entry.itemId)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          )}
        />
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
                      const details = [formatCost(option.costGp), formatWeight(option.weight)].filter(Boolean).join(" | ");
                      return details && (
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          {details}
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
                  onScroll: handleItemsScroll,
                }
              }} />
          )}
        />
        <InventoryPlacementFields form={addForm} profile={selectedItem ? addProfile : null} />
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
        <InventoryPlacementFields form={editForm} profile={editProfile} />
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
    </SheetSection>
  );
}
