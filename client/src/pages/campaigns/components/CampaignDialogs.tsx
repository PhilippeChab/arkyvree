import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type InferRequestType, parseResponse } from "hono/client";
import { useState } from "react";
import { Controller, type UseFormReturn } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import { CreateDialog, DescriptionField, EditDialog, NameField } from "@/client/src/components/common/index.ts";
import {
  BaseRulesetAlert,
  type RulesetOption,
  RulesetPicker,
  useRulesetPickerOptions,
} from "@/client/src/components/rulesets/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith } from "@/client/src/hooks/index.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { requiredRules } from "@/client/src/lib/validation.ts";
import { rpc } from "@/client/src/services/rpc.ts";

interface CreateCampaignDialogProps {
  onClose: () => void;
  /** It has faded out: its opener lets it go, so the next opening starts clean. */
  onExited: () => void;
  open: boolean;
}

interface EditCampaignDialogProps {
  form: UseFormReturn<EditCampaignFormData>;
  onClose: () => void;
  onSubmit: (data: EditCampaignFormData) => void;
  open: boolean;
  pending: boolean;
}

type CreateCampaignFormData = InferRequestType<(typeof rpc.api.campaigns)["$post"]>["json"];

export type EditCampaignFormData = InferRequestType<(typeof rpc.api.campaigns)[":id"]["$put"]>["json"];

/**
 * A new campaign's name, ruleset and description, and its create, which opens the campaign; mounted while it's open,
 * its form, the ruleset's search and pick its own.
 */
export function CreateCampaignDialog({ open, onClose, onExited }: CreateCampaignDialogProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const navigate = useNavigate();
  const form = useFormWith<CreateCampaignFormData>({ name: "", description: "", rulesetId: "" });
  const rulesetOptions = useRulesetPickerOptions("campaign", open);
  const [selectedRuleset, setSelectedRuleset] = useState<RulesetOption | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: CreateCampaignFormData) => parseResponse(rpc.api.campaigns.$post({ json: data })),
    onSuccess: (data) => {
      snackbar.success("Campaign created");
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.campaigns.lists });
      onClose();
      navigate(`/campaigns/${data.campaign.id}`);
    },
    onError: (error) => snackbar.error(error, "Failed to create campaign"),
  });
  const pending = createMutation.isPending;

  return (
    <CreateDialog
      open={open}
      onClose={onClose}
      title="Create New Campaign"
      form={form}
      onSubmit={(data) => createMutation.mutate(data)}
      pending={pending}
      onExited={onExited}
    >
      <BaseRulesetAlert ruleset={selectedRuleset} />
      <NameField control={form.control} name="name" autoFocus disabled={pending} />
      <Controller
        name="rulesetId"
        control={form.control}
        rules={requiredRules("Ruleset is required")}
        render={({ field, fieldState }) => (
          <RulesetPicker
            options={rulesetOptions}
            value={selectedRuleset}
            onChange={(ruleset) => {
              setSelectedRuleset(ruleset);
              field.onChange(ruleset?.id ?? "");
            }}
            disabled={pending}
            error={fieldState.error}
            inputRef={field.ref}
          />
        )}
      />
      <DescriptionField control={form.control} name="description" disabled={pending} rows={4} />
    </CreateDialog>
  );
}

export function EditCampaignDialog({ open, onClose, form, onSubmit, pending }: EditCampaignDialogProps) {
  return (
    <EditDialog open={open} onClose={onClose} title="Edit Campaign" form={form} onSubmit={onSubmit} pending={pending}>
      <NameField control={form.control} name="name" autoFocus disabled={pending} />
      <DescriptionField control={form.control} name="description" disabled={pending} rows={4} />
    </EditDialog>
  );
}
