import { Autocomplete, Box, Button, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useState } from "react";
import { Controller } from "react-hook-form";
import { Link } from "react-router-dom";

import { useValidationIssues, ValidationIssuesAlert } from "@/client/src/components/characters/validation/index.ts";
import {
  AddButton,
  AnimatedAlert,
  BlankNote,
  CreateDialog,
  DeleteDialog,
  EditDialog,
  LoadError,
  RowAction,
  ScrollSafeListbox,
} from "@/client/src/components/common/index.ts";
import { DeleteIcon, EditIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import {
  useDebouncedValue,
  useDialogState,
  useFormWith,
  useListboxQuery,
  useRulesetPermissions,
} from "@/client/src/hooks/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import { formatCost, formatWeight } from "@/client/src/lib/formatNumeric.ts";
import { oneOf } from "@/client/src/lib/oneOf.ts";
import { invalidateCharacter, rulesetDetailQuery } from "@/client/src/lib/queries.ts";
import { requiredRules } from "@/client/src/lib/validation.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import {
  EMPTY_INVENTORY_FORM,
  type EncumbranceData,
  type InventoryFormData,
  LOCATION_CHOICES,
  placementPayload,
} from "./equipment.ts";
import {
  characterInventoryQuery,
  type InventoryEntry,
  inventoryPlacementQuery,
  type RulesetItem,
  rulesetItemQuery,
  rulesetItemSearchQuery,
} from "./equipmentQueries.ts";
import { EquipmentTable } from "./EquipmentTable.tsx";
import { InventoryPlacementFields } from "./InventoryPlacementFields.tsx";
import { SheetSection } from "./SheetSection.tsx";
import { shownWeaponSet } from "./weaponSets.ts";

interface EquipmentSectionProps {
  characterId: string;
  encumbrance?: EncumbranceData;
  readOnly: boolean;
  rulesetId: string;
}

export function EquipmentSection({ characterId, rulesetId, readOnly, encumbrance }: EquipmentSectionProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  // Who may edit the character's ruleset's items creates one from here, in the ruleset's Items tab
  const { data: ruleset, error: rulesetError } = useQuery({ ...rulesetDetailQuery(rulesetId), enabled: !readOnly });
  const { canEditEntities: canCreateItems } = useRulesetPermissions(ruleset);

  // The inventory the dialogs check a slot against
  const { data: inventoryItems = [], error: inventoryError } = useQuery(characterInventoryQuery(characterId));

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const { issues, setIssues, handleSaveError } = useValidationIssues("Failed to save item");
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

  // The picked item's details (add dialog): how it's placed
  const { data: itemDetail, error: itemDetailError } = useQuery(rulesetItemQuery(rulesetId, selectedItem?.id));
  const addProfile = itemDetail?.placement ?? null;

  // An item picked in the add dialog fills its slot and charges once its details arrive, unless another was picked since
  const fillPlacement = (itemId: string) => {
    queryClient.fetchQuery(rulesetItemQuery(rulesetId, itemId)).then(
      ({ placement }) => {
        if (addForm.getValues("selectedItem")?.id !== itemId) return;
        if (placement.slot) addForm.setValue("location", placement.slot, { shouldDirty: true });
        else if (!placement.hand) addForm.setValue("location", "none", { shouldDirty: true });
        if (placement.charges !== null) {
          addForm.setValue("totalCharges", placement.charges, { shouldDirty: true });
          addForm.setValue("remainingCharges", placement.charges, { shouldDirty: true });
        }
      },
      // The details' query shows its own failure
      () => undefined,
    );
  };

  // How the edited entry's item is placed (edit dialog)
  const editProfile = editingEntry?.placement ?? null;

  // What keeps the picked slot from taking the item, as the server's rules say: shown above each dialog's fields
  const { data: addPlacement, error: addPlacementError } = useQuery({
    ...inventoryPlacementQuery(characterId, addLocation, addWeaponSet),
    enabled: addDialogOpen,
  });
  const { data: editPlacement, error: editPlacementError } = useQuery({
    ...inventoryPlacementQuery(characterId, editLocation, editWeaponSet, editingEntry?.id),
    enabled: editDialog.open,
  });
  const addSlotWarning = addPlacement?.warning;
  const editSlotWarning = editPlacement?.warning;

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
          json: { itemId: item.id, ...placementPayload(data, addProfile), force },
        }),
      ),
    onSuccess: () => {
      snackbar.success("Item added to inventory");
      invalidateCharacter(queryClient, characterId);
      setAddDialogOpen(false);
      setIssues([]);
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
          json: { ...placementPayload(data, editProfile), force, updatedAt: editingEntry?.updatedAt },
        }),
      ),
    onSuccess: () => {
      snackbar.success("Item updated");
      invalidateCharacter(queryClient, characterId);
      editDialog.close();
      setIssues([]);
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
      invalidateCharacter(queryClient, characterId);
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
  const issuesAlert = (visible: boolean, onForce: () => void) =>
    visible && (
      <ValidationIssuesAlert
        issues={issues}
        title="Equipment Warnings"
        onClose={() => setIssues([])}
        onProceed={onForce}
        pending={addMutation.isPending || updateMutation.isPending}
      />
    );

  const hasItems = inventoryItems.length > 0;

  return (
    <SheetSection
      title="Equipment & Inventory"
      action={
        !readOnly && (
          <Stack direction="row" spacing={1}>
            {canCreateItems && (
              <Tooltip describeChild title="Opens the ruleset's Items tab in a new browser tab">
                <Button
                  variant="outlined"
                  size="small"
                  component={Link}
                  to={`/rulesets/${rulesetId}/items`}
                  target="_blank"
                >
                  Create Item
                </Button>
              </Tooltip>
            )}
            {/* An empty inventory offers its Add Item under its note */}
            {hasItems && <AddButton label="Add Item" size="small" onClick={handleAddItem} />}
          </Stack>
        )
      }
    >
      <Stack spacing={2}>
        {/* Whether Create Item shows: the ruleset's rights */}
        {!readOnly && !!rulesetError && !ruleset && <LoadError what="Ruleset" error={rulesetError} />}
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
              readOnly
                ? undefined
                : (entry) => (
                    <>
                      <RowAction icon={EditIcon} label={`Edit ${entry.name}`} onClick={() => handleEditItem(entry)} />
                      <RowAction
                        icon={DeleteIcon}
                        label={`Remove ${entry.name}`}
                        intent="destructive"
                        onClick={() => handleDeleteItem(entry.id)}
                      />
                    </>
                  )
            }
          />
        ) : (
          <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
            <BlankNote>No equipment</BlankNote>
            {!readOnly && <AddButton label="Add Item" onClick={handleAddItem} />}
          </Stack>
        )}
      </Stack>
      <CreateDialog
        open={addDialogOpen}
        onClose={() => {
          setAddDialogOpen(false);
          setIssues([]);
        }}
        title="Add Item to Inventory"
        form={addForm}
        onSubmit={(data) => handleAddSubmit(data)}
        pending={addMutation.isPending}
        submitLabel="Add Item"
        maxWidth="md"
      >
        {issuesAlert(
          issues.length > 0 && addDialogOpen,
          // Through the form, so its own rules still hold on a forced save; the warnings clear once it passes.
          () =>
            void addForm.handleSubmit((data) => {
              setIssues([]);
              handleAddSubmit(data, true);
            })(),
        )}
        {!!inventoryError && <LoadError what="Inventory" error={inventoryError} />}
        {!!addPlacementError && <LoadError what="Slot warning" error={addPlacementError} />}
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
      <EditDialog
        open={editDialog.open}
        onClose={() => {
          editDialog.close();
          setIssues([]);
        }}
        title="Edit Inventory Item"
        form={editForm}
        onSubmit={(data) => editingEntry && updateMutation.mutate({ entryId: editingEntry.id, data })}
        pending={updateMutation.isPending}
        maxWidth="md"
      >
        {issuesAlert(
          issues.length > 0 && editDialog.open,
          () =>
            void editForm.handleSubmit((data) => {
              setIssues([]);
              if (editingEntry) updateMutation.mutate({ entryId: editingEntry.id, data, force: true });
            })(),
        )}
        {!!inventoryError && <LoadError what="Inventory" error={inventoryError} />}
        {!!editPlacementError && <LoadError what="Slot warning" error={editPlacementError} />}
        {editSlotWarning && (
          <AnimatedAlert in severity="warning">
            {editSlotWarning}
          </AnimatedAlert>
        )}
        <TextField
          label="Item"
          value={editingEntry?.item.name ?? ""}
          fullWidth
          slotProps={{ input: { readOnly: true } }}
        />
        <InventoryPlacementFields form={editForm} profile={editProfile} />
      </EditDialog>
      <DeleteDialog
        open={deleteDialog.open}
        onClose={deleteDialog.close}
        title="Remove Item"
        message="Are you sure you want to remove this item from the inventory? This action cannot be undone."
        confirmLabel="Remove Item"
        onConfirm={() => deleteDialog.target && removeMutation.mutate(deleteDialog.target)}
        pending={removeMutation.isPending}
      />
    </SheetSection>
  );
}
