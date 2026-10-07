import type { InferRequestType } from "hono/client";
import { useState } from "react";
import { Controller, type UseFormReturn } from "react-hook-form";

import { CreateDialog, DescriptionField, EditDialog, NameField } from "@/client/src/components/common/index.ts";
import { BaseRulesetAlert, RulesetPicker } from "@/client/src/components/rulesets/index.ts";
import { useDebouncedValue, useListboxQuery } from "@/client/src/hooks/index.ts";
import { rulesetPickerQuery } from "@/client/src/lib/queries.ts";
import { NAME_RULES, requiredRules } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

interface CreateCampaignDialogProps {
  form: UseFormReturn<CreateCampaignFormData>;
  isLoading: boolean;
  onClose: () => void;
  /** It has faded out: its opener lets it go, so the next opening's picker starts clean. */
  onExited: () => void;
  onSubmit: (data: CreateCampaignFormData) => void;
  open: boolean;
}

interface EditCampaignDialogProps {
  form: UseFormReturn<EditCampaignFormData>;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (data: EditCampaignFormData) => void;
  open: boolean;
}

export type CreateCampaignFormData = InferRequestType<(typeof rpc.api.campaigns)["$post"]>["json"];

export type EditCampaignFormData = InferRequestType<(typeof rpc.api.campaigns)[":id"]["$put"]>["json"];

/** A new campaign's name, ruleset and description; mounted while it's open, the ruleset's search and pick its own. */
export function CreateCampaignDialog({
  open,
  onClose,
  onExited,
  form,
  onSubmit,
  isLoading,
}: CreateCampaignDialogProps) {
  const [rulesetSearch, setRulesetSearch] = useState("");
  const debouncedRulesetSearch = useDebouncedValue(rulesetSearch);

  const {
    items: publishedRulesets,
    isLoading: rulesetsLoading,
    error: rulesetsError,
    onScroll: handleRulesetsScroll,
  } = useListboxQuery({
    ...rulesetPickerQuery("published", debouncedRulesetSearch),
    enabled: open,
  });

  const rulesets = publishedRulesets
    .map((r) => ({ ...r, group: r.status === "Draft" ? ("My Drafts" as const) : ("Published" as const) }))
    .sort((a, b) => (a.group === b.group ? 0 : a.group === "My Drafts" ? -1 : 1));
  const [selectedRuleset, setSelectedRuleset] = useState<(typeof rulesets)[number] | null>(null);

  return (
    <CreateDialog
      open={open}
      onClose={onClose}
      title="Create New Campaign"
      form={form}
      onSubmit={onSubmit}
      isLoading={isLoading}
      onExited={onExited}
    >
      <BaseRulesetAlert ruleset={selectedRuleset} />
      <NameField control={form.control} name="name" rules={NAME_RULES} autoFocus disabled={isLoading} />
      <Controller
        name="rulesetId"
        control={form.control}
        rules={requiredRules("Ruleset is required")}
        render={({ field, fieldState }) => (
          <RulesetPicker
            rulesets={rulesets}
            value={selectedRuleset}
            onChange={(ruleset) => {
              setSelectedRuleset(ruleset);
              field.onChange(ruleset?.id ?? "");
            }}
            onSearch={setRulesetSearch}
            onScroll={handleRulesetsScroll}
            loading={rulesetsLoading}
            loadError={rulesetsError}
            disabled={isLoading}
            error={fieldState.error}
            inputRef={field.ref}
          />
        )}
      />
      <DescriptionField control={form.control} name="description" disabled={isLoading} rows={4} />
    </CreateDialog>
  );
}

export function EditCampaignDialog({ open, onClose, form, onSubmit, isLoading }: EditCampaignDialogProps) {
  return (
    <EditDialog
      open={open}
      onClose={onClose}
      title="Edit Campaign"
      form={form}
      onSubmit={onSubmit}
      isLoading={isLoading}
    >
      <NameField control={form.control} name="name" rules={NAME_RULES} autoFocus disabled={isLoading} />
      <DescriptionField control={form.control} name="description" disabled={isLoading} rows={4} />
    </EditDialog>
  );
}
