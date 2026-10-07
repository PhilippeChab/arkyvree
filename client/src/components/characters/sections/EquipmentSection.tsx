import { Autocomplete, Box, Button, IconButton, Stack, TextField, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import { useMemo, useState } from "react";
import { Controller } from "react-hook-form";
import { Link } from "react-router-dom";

import {
  AnimatedAlert,
  BlankState,
  CreateDialog,
  DeleteDialog,
  DiceSpinner,
  EditDialog,
  ScrollSafeListbox,
  ValidationIssueList,
} from "@/client/src/components/common/index.ts";
import { AddIcon, DeleteIcon, EditIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDebouncedValue, useFormWith, useListboxQuery, useValidationIssues } from "@/client/src/hooks/index.ts";
import { formatCost, formatWeight } from "@/client/src/lib/formatNumeric.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { requiredRules } from "@/client/src/lib/validation.ts";
import { type RPC, rpc } from "@/client/src/services/rpc.ts";

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
import { characterInventoryQuery, rulesetItemQuery, rulesetItemSearchQuery } from "./equipmentQueries.ts";
import { EquipmentTable } from "./EquipmentTable.tsx";
import { InventoryPlacementFields } from "./InventoryPlacementFields.tsx";
import { SheetSection } from "./SheetSection.tsx";
import { shownWeaponSet } from "./weaponSets.ts";

interface EquipmentSectionProps {
  characterId: string;
  rulesetId: string;
  isArchived: boolean;
  isCustomRuleset?: boolean;
  encumbrance?: EncumbranceData;
}
type InventoryEntry = InventoryItems[number];

type InventoryItems = InferResponseType<RPC["api"]["characters"]["inventory"][":characterId"]["$get"], 200>;

/** An item's placement, from its details: its columns and properties' profile (slot, weapon, charges). */
function placementOf(detail: {
  type?: string | null;
  slot?: string | null;
  properties?: Parameters<typeof placementProfile>[1];
}) {
  const columns: ItemColumns = { type: detail.type ?? null, slot: detail.slot ?? "Other" };
  return { columns, profile: placementProfile(columns, detail.properties ?? []) };
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

  const { data: inventoryItems = [] } = useQuery(characterInventoryQuery(characterId));

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { validationErrors, setValidationErrors, handleSaveError } = useValidationIssues();
  const [editingEntry, setEditingEntry] = useState<InventoryEntry | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [itemSearch, setItemSearch] = useState("");
  const debouncedItemSearch = useDebouncedValue(itemSearch);

  const addForm = useFormWith<InventoryFormData>(EMPTY_INVENTORY_FORM);
  const editForm = useFormWith<InventoryFormData>(EMPTY_INVENTORY_FORM);

  const selectedItem = addForm.watch("selectedItem");
  const addLocation = addForm.watch("location");
  const addWeaponSet = addForm.watch("weaponSet");
  const editLocation = editForm.watch("location");
  const editWeaponSet = editForm.watch("weaponSet");

  // The picked item's details (add dialog): its placement profile
  const { data: itemDetail } = useQuery(rulesetItemQuery(rulesetId, selectedItem?.id));
  const addProfile = useMemo(() => (itemDetail ? placementOf(itemDetail).profile : null), [itemDetail]);

  // An item picked in the add dialog fills its slot and charges once its details arrive, unless another was picked since
  const fillPlacement = (itemId: string) => {
    queryClient.fetchQuery(rulesetItemQuery(rulesetId, itemId)).then(
      (detail) => {
        if (addForm.getValues("selectedItem")?.id !== itemId) return;
        const { columns, profile } = placementOf(detail);
        const detected = detectSlotFromItem(columns);
        if (detected) addForm.setValue("location", detected);
        else if (!profile.isWeapon) addForm.setValue("location", "none");
        if (profile.charges.has) {
          addForm.setValue("totalCharges", profile.charges.defaultCount);
          addForm.setValue("remainingCharges", profile.charges.defaultCount);
        }
      },
      // The details' query shows its own failure
      () => undefined,
    );
  };

  // Edit dialog properties from the inventory entry
  const editItemProperties = useMemo(() => editingEntry?.item.properties ?? [], [editingEntry]);
  const editItemColumns: ItemColumns = useMemo(
    () => ({ type: editingEntry?.item.type ?? null, slot: editingEntry?.item.slot ?? "Other" }),
    [editingEntry],
  );
  const editProfile = useMemo(
    () => placementProfile(editItemColumns, editItemProperties),
    [editItemColumns, editItemProperties],
  );

  const addSlotWarning = useMemo(
    () => getSlotConflictWarning(addLocation, addWeaponSet, inventoryItems),
    [addLocation, addWeaponSet, inventoryItems],
  );

  const editSlotWarning = useMemo(
    () => getSlotConflictWarning(editLocation, editWeaponSet, inventoryItems, editingEntry?.id),
    [editLocation, editWeaponSet, inventoryItems, editingEntry],
  );

  // Item search infinite query
  const {
    items: searchItems,
    isLoading: isLoadingSearch,
    onScroll: handleItemsScroll,
  } = useListboxQuery({ ...rulesetItemSearchQuery(rulesetId, debouncedItemSearch), enabled: addDialogOpen });

  const addMutation = useMutation({
    mutationFn: async ({ data, force = false }: { data: InventoryFormData; force?: boolean }) => {
      if (!data.selectedItem) throw new Error("No item selected");
      return parseResponse(
        rpc.api.characters.inventory[":characterId"].$post({
          param: { characterId },
          json: { itemId: data.selectedItem.id, ...placementPayload(data, !!addProfile?.charges.has), force },
        }),
      );
    },
    onSuccess: () => {
      snackbar.success("Item added to inventory");
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.characters.detail(characterId),
      });
      setAddDialogOpen(false);
      setValidationErrors([]);
    },
    onError: handleSaveError,
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      entryId,
      data,
      force = false,
    }: {
      entryId: string;
      data: InventoryFormData;
      force?: boolean;
    }) => {
      return parseResponse(
        rpc.api.characters.inventory[":characterId"][":entryId"].$put({
          param: { characterId, entryId },
          json: { ...placementPayload(data, editProfile.charges.has), force, updatedAt: editingEntry?.updatedAt },
        }),
      );
    },
    onSuccess: () => {
      snackbar.success("Item updated");
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.characters.detail(characterId),
      });
      setEditDialogOpen(false);
      setValidationErrors([]);
    },
    onError: handleSaveError,
  });

  const removeMutation = useMutation({
    mutationFn: async (entryId: string) => {
      return parseResponse(
        rpc.api.characters.inventory[":characterId"][":entryId"].$delete({
          param: { characterId, entryId },
        }),
      );
    },
    onSuccess: () => {
      snackbar.success("Item removed from inventory");
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.characters.detail(characterId),
      });
      setDeleteDialogOpen(false);
      setDeletingEntryId(null);
    },
    onError: (error) => {
      snackbar.error(error, "Failed to remove item");
    },
  });

  // The dialogs keep their values while they fade out, and start afresh when opened.
  const handleAddItem = () => {
    addForm.reset();
    setItemSearch("");
    setAddDialogOpen(true);
  };

  const handleEditItem = (entry: InventoryEntry) => {
    setEditingEntry(entry);
    editForm.reset({
      quantity: entry.quantity ?? 1,
      location: oneOf(entry.location, LOCATION_CHOICES, "none"),
      weaponSet: shownWeaponSet(entry.weaponSet ?? 0),
      totalCharges: entry.totalCharges ?? 0,
      remainingCharges: entry.remainingCharges ?? 0,
    });
    setEditDialogOpen(true);
  };

  const handleDeleteItem = (entryId: string) => {
    setDeletingEntryId(entryId);
    setDeleteDialogOpen(true);
  };

  const requirementAlert = (visible: boolean, onForce?: () => void) =>
    visible && (
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
              onClick={onForce}
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
    );

  const hasItems = inventoryItems.length > 0;

  return (
    <SheetSection
      title="Equipment & Inventory"
      action={
        !isArchived &&
        hasItems && (
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
            <Button variant="contained" size="small" onClick={handleAddItem}>
              Add Item
            </Button>
          </Stack>
        )
      }
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
          renderActions={
            isArchived
              ? undefined
              : (entry) => (
                  <Stack direction="row" spacing={0} sx={{ justifyContent: "center" }}>
                    <IconButton size="small" aria-label={`Edit ${entry.name}`} onClick={() => handleEditItem(entry)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      aria-label={`Remove ${entry.name}`}
                      onClick={() => handleDeleteItem(entry.id)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                )
          }
        />
      ) : (
        <BlankState
          title="No equipment"
          description="Add items to this character's inventory."
          action={
            !isArchived ? (
              <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddItem}>
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
          // Through the form, so its own rules still hold on a forced save; the warnings clear once it passes.
          () =>
            void addForm.handleSubmit((data) => {
              setValidationErrors([]);
              addMutation.mutate({ data, force: true });
            })(),
        )}
        {addSlotWarning && (
          <AnimatedAlert in severity="warning">
            {addSlotWarning}
          </AnimatedAlert>
        )}
        <Controller
          name="selectedItem"
          control={addForm.control}
          rules={requiredRules("Item is required")}
          render={({ field, fieldState }) => (
            <Autocomplete
              options={searchItems}
              filterOptions={(x) => x}
              getOptionLabel={(option) => option.name}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              value={field.value}
              onChange={(_, newValue) => {
                field.onChange(newValue);
                if (newValue) {
                  fillPlacement(newValue.id);
                } else {
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
                  inputRef={field.ref}
                  label="Search Item"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  slotProps={{
                    ...params.slotProps,

                    input: {
                      ...params.slotProps.input,
                      endAdornment: (
                        <>
                          {isLoadingSearch && <DiceSpinner size="small" />}
                          {params.slotProps.input.endAdornment}
                        </>
                      ),
                    },
                  }}
                />
              )}
              renderOption={(props, option) => (
                <Box component="li" {...props} key={option.id}>
                  <Box>
                    <Typography variant="body2">{option.name}</Typography>
                    {(() => {
                      const details = [formatCost(option.costGp), formatWeight(option.weight)]
                        .filter(Boolean)
                        .join(" | ");
                      return (
                        details && (
                          <Typography variant="caption" sx={{ color: "text.secondary" }}>
                            {details}
                          </Typography>
                        )
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
                },
              }}
            />
          )}
        />
        <InventoryPlacementFields form={addForm} profile={selectedItem ? addProfile : null} />
      </CreateDialog>
      {/* Edit Item Dialog */}
      <EditDialog
        open={editDialogOpen}
        onClose={() => {
          setEditDialogOpen(false);
          setValidationErrors([]);
        }}
        title="Edit Inventory Item"
        form={editForm}
        onSubmit={(data) => editingEntry && updateMutation.mutate({ entryId: editingEntry.id, data })}
        isLoading={updateMutation.isPending}
        maxWidth="md"
      >
        {requirementAlert(
          validationErrors.length > 0 && editDialogOpen,
          editingEntry
            ? () =>
                void editForm.handleSubmit((data) => {
                  setValidationErrors([]);
                  updateMutation.mutate({ entryId: editingEntry.id, data, force: true });
                })()
            : undefined,
        )}
        {editSlotWarning && (
          <AnimatedAlert in severity="warning">
            {editSlotWarning}
          </AnimatedAlert>
        )}
        <TextField label="Item" value={editingEntry?.item.name ?? ""} fullWidth disabled />
        <InventoryPlacementFields form={editForm} profile={editProfile} />
      </EditDialog>
      {/* Remove Confirmation */}
      <DeleteDialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setDeletingEntryId(null);
        }}
        title="Remove Item"
        message="Are you sure you want to remove this item from the inventory?"
        confirmLabel="Remove"
        onConfirm={() => deletingEntryId && removeMutation.mutate(deletingEntryId)}
        isLoading={removeMutation.isPending}
      />
    </SheetSection>
  );
}
