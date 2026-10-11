import type { InferRequestType } from "hono/client";
import { useState } from "react";
import { Controller, type UseFormReturn } from "react-hook-form";

import { CreateDialog, DescriptionField, EditDialog, NameField } from "@/client/src/components/common/index.ts";
import {
  BaseRulesetAlert,
  type RulesetOption,
  RulesetPicker,
  useRulesetPickerOptions,
} from "@/client/src/components/rulesets/index.ts";
import { requiredRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

interface CreateCampaignDialogProps {
  form: UseFormReturn<CreateCampaignFormData>;
  onClose: () => void;
  /** It has faded out: its opener lets it go, so the next opening's picker starts clean. */
  onExited: () => void;
  onSubmit: (data: CreateCampaignFormData) => void;
  open: boolean;
  pending: boolean;
}

interface EditCampaignDialogProps {
  form: UseFormReturn<EditCampaignFormData>;
  onClose: () => void;
  onSubmit: (data: EditCampaignFormData) => void;
  open: boolean;
  pending: boolean;
}

export type CreateCampaignFormData = InferRequestType<(typeof rpc.api.campaigns)["$post"]>["json"];

export type EditCampaignFormData = InferRequestType<(typeof rpc.api.campaigns)[":id"]["$put"]>["json"];

/** A new campaign's name, ruleset and description; mounted while it's open, the ruleset's search and pick its own. */
export function CreateCampaignDialog({ open, onClose, onExited, form, onSubmit, pending }: CreateCampaignDialogProps) {
  const rulesetOptions = useRulesetPickerOptions("campaign", open);
  const [selectedRuleset, setSelectedRuleset] = useState<RulesetOption | null>(null);

  return (
    <CreateDialog
      open={open}
      onClose={onClose}
      title="Create New Campaign"
      form={form}
      onSubmit={onSubmit}
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
