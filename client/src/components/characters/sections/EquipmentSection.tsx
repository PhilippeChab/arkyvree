import { Autocomplete, Box, Button, IconButton, Stack, TextField, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import { useMemo, useState } from "react";
import { Controller } from "react-hook-form";
import { Link } from "react-router-dom";

import {
  AddButton,
  AnimatedAlert,
  BlankNote,
  CreateDialog,
  DeleteDialog,
  DiceSpinner,
  EditDialog,
  LoadError,
  ScrollSafeListbox,
  ValidationIssuesAlert,
} from "@/client/src/components/common/index.ts";
import { DeleteIcon, EditIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import {
  useDebouncedValue,
  useDialogState,
  useFormWith,
  useListboxQuery,
  useValidationIssues,
} from "@/client/src/hooks/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import { formatCost, formatWeight } from "@/client/src/lib/formatNumeric.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import type { RulesetItem } from "@/client/src/lib/queries.ts";
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
  encumbrance?: EncumbranceData;
  isArchived: boolean;
  isCustomRuleset?: boolean;
  rulesetId: string;
}
type InventoryEntry = InventoryItems[number];

type InventoryItems = InferResponseType<RPC["api"]["characters"]["inventory"][":characterId"]["$get"], 200>;

/** An item's placement, from its details: its columns and properties' profile (slot, weapon, charges). */
function placementOf(detail: {
  properties?: Parameters<typeof placementProfile>[1];
  slot?: string | null;
  type?: string | null;
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

  // The inventory the dialogs check a slot against
  const { data: inventoryItems = [], error: inventoryError } = useQuery(characterInventoryQuery(characterId));

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const { validationErrors, setValidationErrors, handleSaveError } = useValidationIssues("Failed to save item");
  // An entry's edit and remove dialogs keep it while they fade out
  const editDialog = useDialogState<InventoryEntry>();
  const deleteDialog = useDialogState<string>();
  const editingEntry = editDialog.target;
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
  const { data: itemDetail, error: itemDetailError } = useQuery(rulesetItemQuery(rulesetId, selectedItem?.id));
  const addProfile = useMemo(() => (itemDetail ? placementOf(itemDetail).profile : null), [itemDetail]);

  // An item picked in the add dialog fills its slot and charges once its details arrive, unless another was picked since
  const fillPlacement = (itemId: string) => {
    queryClient.fetchQuery(rulesetItemQuery(rulesetId, itemId)).then(
      (detail) => {
        if (addForm.getValues("selectedItem")?.id !== itemId) return;
        const { columns, profile } = placementOf(detail);
        const detected = detectSlotFromItem(columns);
        if (detected) addForm.setValue("location", detected, { shouldDirty: true });
        else if (!profile.isWeapon) addForm.setValue("location", "none", { shouldDirty: true });
        if (profile.charges.has) {
          addForm.setValue("totalCharges", profile.charges.defaultCount, { shouldDirty: true });
          addForm.setValue("remainingCharges", profile.charges.defaultCount, { shouldDirty: true });
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
    error: searchError,
    onScroll: handleItemsScroll,
  } = useListboxQuery({ ...rulesetItemSearchQuery(rulesetId, debouncedItemSearch), enabled: addDialogOpen });

  const addMutation = useMutation({
    mutationFn: async ({
      item,
      data,
      force = false,
    }: {
      data: InventoryFormData;
      force?: boolean;
      item: RulesetItem;
    }) =>
      parseResponse(
        rpc.api.characters.inventory[":characterId"].$post({
          param: { characterId },
          json: { itemId: item.id, ...placementPayload(data, !!addProfile?.charges.has), force },
        }),
      ),
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
      data: InventoryFormData;
      entryId: string;
      force?: boolean;
    }) =>
      parseResponse(
        rpc.api.characters.inventory[":characterId"][":entryId"].$put({
          param: { characterId, entryId },
          json: { ...placementPayload(data, editProfile.charges.has), force, updatedAt: editingEntry?.updatedAt },
        }),
      ),
    onSuccess: () => {
      snackbar.success("Item updated");
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.characters.detail(characterId),
      });
      editDialog.close();
      setValidationErrors([]);
    },
    onError: handleSaveError,
  });

  const removeMutation = useMutation({
    mutationFn: async (entryId: string) =>
      parseResponse(
        rpc.api.characters.inventory[":characterId"][":entryId"].$delete({
          param: { characterId, entryId },
        }),
      ),
    onSuccess: () => {
      snackbar.success("Item removed from inventory");
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.characters.detail(characterId),
      });
      deleteDialog.close();
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
    editForm.reset({
      quantity: entry.quantity ?? 1,
      location: oneOf(entry.location, LOCATION_CHOICES, "none"),
      weaponSet: shownWeaponSet(entry.weaponSet ?? 0),
      totalCharges: entry.totalCharges ?? 0,
      remainingCharges: entry.remainingCharges ?? 0,
    });
    editDialog.openWith(entry);
  };

  const handleDeleteItem = (entryId: string) => deleteDialog.openWith(entryId);

  // The item's rule holds the submit until one is picked
  const handleAddSubmit = (data: InventoryFormData, force?: boolean) => {
    if (data.selectedItem) addMutation.mutate({ item: data.selectedItem, data, force });
  };

  // A dialog's warnings: in its spaced fields, so mounted only while they show
  const requirementAlert = (visible: boolean, onForce?: () => void) =>
    visible && (
      <ValidationIssuesAlert
        issues={validationErrors}
        title="Equipment warnings"
        onClose={() => setValidationErrors([])}
        onProceed={onForce}
        pending={addMutation.isPending || updateMutation.isPending}
      />
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
        <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
          <BlankNote>No equipment</BlankNote>
          {!isArchived && <AddButton label="Add Item" onClick={handleAddItem} />}
        </Stack>
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
        onSubmit={(data) => handleAddSubmit(data)}
        isLoading={addMutation.isPending}
        maxWidth="md"
      >
        {requirementAlert(
          validationErrors.length > 0 && addDialogOpen,
          // Through the form, so its own rules still hold on a forced save; the warnings clear once it passes.
          () =>
            void addForm.handleSubmit((data) => {
              setValidationErrors([]);
              handleAddSubmit(data, true);
            })(),
        )}
        {!!inventoryError && <LoadError what="Inventory" error={inventoryError} />}
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
                  addForm.setValue("location", "none", { shouldDirty: true });
                  addForm.setValue("totalCharges", 0, { shouldDirty: true });
                  addForm.setValue("remainingCharges", 0, { shouldDirty: true });
                }
              }}
              onInputChange={(_, value, reason) => {
                if (reason === "input") setItemSearch(value);
              }}
              loading={isLoadingSearch}
              noOptionsText={emptyOptionsText("Items", searchError)}
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
        {!!selectedItem && !!itemDetailError && <LoadError what="Item" error={itemDetailError} />}
        <InventoryPlacementFields form={addForm} profile={selectedItem ? addProfile : null} />
      </CreateDialog>
      {/* Edit Item Dialog */}
      <EditDialog
        open={editDialog.open}
        onClose={() => {
          editDialog.close();
          setValidationErrors([]);
        }}
        title="Edit Inventory Item"
        form={editForm}
        onSubmit={(data) => editingEntry && updateMutation.mutate({ entryId: editingEntry.id, data })}
        isLoading={updateMutation.isPending}
        maxWidth="md"
      >
        {requirementAlert(
          validationErrors.length > 0 && editDialog.open,
          editingEntry
            ? () =>
                void editForm.handleSubmit((data) => {
                  setValidationErrors([]);
                  updateMutation.mutate({ entryId: editingEntry.id, data, force: true });
                })()
            : undefined,
        )}
        {!!inventoryError && <LoadError what="Inventory" error={inventoryError} />}
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
        open={deleteDialog.open}
        onClose={deleteDialog.close}
        title="Remove Item"
        message="Are you sure you want to remove this item from the inventory? This action cannot be undone."
        confirmLabel="Remove"
        onConfirm={() => deleteDialog.target && removeMutation.mutate(deleteDialog.target)}
        isLoading={removeMutation.isPending}
      />
    </SheetSection>
  );
}
