import type { UseFormReturn } from "react-hook-form";

import { CreateDialog, DeleteDialog, FormTextField } from "@/client/src/components/common/index.ts";
import { useRules } from "@/client/src/hooks/index.ts";
import { wholeNumberRules } from "@/client/src/lib/validation.ts";
import {
  EntityFormFields,
  type LevelColumns,
  type LevelFormData,
  type LevelLinks,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import type { LinkWords } from "@/client/src/pages/rulesets/details/owners/ownerTab.ts";
import { useAllAmounts } from "@/client/src/pages/rulesets/hooks/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

interface CreateLevelDialogProps {
  /** The ruleset's, whose last level bounds the level's number, and whose fields a level has. */
  baseRules: BaseRules;
  /** Its level kind's columns past its fields: its amounts, which its save sends all of */
  columns: LevelColumns;
  form: UseFormReturn<LevelFormData>;
  /** Its level kind (3.5's `class_levels`), whose columns and fields its form shows */
  levelType: string;
  onClose: () => void;
  onSubmit: (data: LevelFormData) => void;
  open: boolean;
  pending: boolean;
  rulesetId: string;
}

interface RemoveLinkDialogProps {
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  pending: boolean;
  /** The removal can be undone from Local Changes: the owner is inherited, or a copy of one (`useRestorableDelete`). */
  restorable: boolean;
  /** Its rules' words: the linked entity's (`one`, "Skill") and the owner's (`owner`, "class"). */
  words: LinkWords;
}

export function CreateLevelDialog({
  open,
  onClose,
  form,
  onSubmit,
  pending,
  rulesetId,
  baseRules,
  columns,
  levelType,
}: CreateLevelDialogProps) {
  const { withAll } = useAllAmounts(rulesetId, columns.amounts);
  // Its rules' last level bounds the number (none while they load: the save's check still holds it)
  const lastLevel = useRules(baseRules).rules?.progression.lastLevel;

  // The endpoint takes an amount of every entity its amounts are of (3.5's every ruleset save), 0 when unset
  const amountsRole = columns.amounts?.role;
  const handleSubmit = (data: LevelFormData) =>
    onSubmit(
      amountsRole
        ? {
            ...data,
            links: { ...data.links, [amountsRole]: withAll(data.links?.[amountsRole] ?? []) as LevelLinks[string] },
          }
        : data,
    );

  return (
    <CreateDialog
      open={open}
      onClose={onClose}
      title="Create New Level"
      form={form}
      onSubmit={handleSubmit}
      pending={pending}
    >
      <FormTextField
        control={form.control}
        name="position"
        rules={wholeNumberRules(1, "Level is required", lastLevel)}
        number
        label="Level"
        fullWidth
        slotProps={{
          htmlInput: { min: 1, max: lastLevel },
        }}
      />
      <EntityFormFields form={form} entityType={levelType} rulesetId={rulesetId} />
    </CreateDialog>
  );
}

/** The confirmation of a link's removal from an owner (3.5's class skill's), in its rules' words. */
export function RemoveLinkDialog({ restorable, words, ...props }: RemoveLinkDialogProps) {
  const one = words.one.toLowerCase();
  return (
    <DeleteDialog
      {...props}
      title={`Remove ${words.one}`}
      message={
        restorable
          ? `Are you sure you want to remove this ${one} from the ${words.owner}? You can restore it from Local Changes.`
          : `Are you sure you want to remove this ${one} from the ${words.owner}? This action cannot be undone.`
      }
      confirmLabel={`Remove ${words.one}`}
    />
  );
}
