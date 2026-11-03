import type { UseFormReturn } from "react-hook-form";

import { CreateDialog, DeleteDialog, FormTextField } from "@/client/src/components/common/index.ts";
import { useRules } from "@/client/src/hooks/index.ts";
import { positionWordOf } from "@/client/src/lib/rulesetLabels.ts";
import { wholeNumberRules } from "@/client/src/lib/validation.ts";
import {
  EntityFields,
  type OwnedFormData,
  type OwnedLinks,
  type OwnedLists,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import type { LinkWords } from "@/client/src/pages/rulesets/details/owners/ownerTab.ts";
import { useAllAmounts } from "@/client/src/pages/rulesets/hooks/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

interface CreateOwnedDialogProps {
  /** The ruleset's, whose last position bounds the owned entity's number, and whose fields an owned entity has. */
  baseRules: BaseRules;
  form: UseFormReturn<OwnedFormData>;
  /** Its owned kind's lists of links: its amounts, which its save sends all of */
  lists: OwnedLists;
  /** The places of its fields its owner's kind leaves out (`omittedPlacesOf`), which its form doesn't show */
  omitted: readonly string[];
  onClose: () => void;
  onSubmit: (data: OwnedFormData) => void;
  open: boolean;
  /** Its owned kind (3.5's `class-levels`), whose fields its form shows and whose word its title says */
  ownedType: string;
  pending: boolean;
  rulesetId: string;
}

interface RemoveLinkDialogProps {
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  pending: boolean;
  /**
   * The removal can be undone from Local Changes: the owner is inherited, or a copy of one (its owner's
   * `restorableDelete`).
   */
  restorable: boolean;
  /** Its rules' words: the linked entity's (`one`, "Skill") and the owner's (`owner`, "class"). */
  words: LinkWords;
}

export function CreateOwnedDialog({
  open,
  onClose,
  form,
  onSubmit,
  pending,
  rulesetId,
  baseRules,
  lists,
  omitted,
  ownedType,
}: CreateOwnedDialogProps) {
  const { withAll } = useAllAmounts(rulesetId, lists.amounts);
  // Its rules' last position bounds the number (none while they load: the save's check still holds it)
  const { rules } = useRules(baseRules);
  const lastPosition = rules?.progression.lastPosition;
  const position = positionWordOf(ownedType, rules?.words);

  // The endpoint takes an amount of every entity its amounts are of (3.5's every ruleset save), 0 when unset
  const amountsRole = lists.amounts?.role;
  const handleSubmit = (data: OwnedFormData) =>
    onSubmit(
      amountsRole
        ? {
            ...data,
            links: { ...data.links, [amountsRole]: withAll(data.links?.[amountsRole] ?? []) as OwnedLinks[string] },
          }
        : data,
    );

  return (
    <CreateDialog
      open={open}
      onClose={onClose}
      title={`Create New ${position}`}
      form={form}
      onSubmit={handleSubmit}
      pending={pending}
    >
      <FormTextField
        control={form.control}
        name="position"
        rules={wholeNumberRules(1, `${position} is required`, lastPosition)}
        number
        label={position}
        fullWidth
        slotProps={{
          htmlInput: { min: 1, max: lastPosition },
        }}
      />
      <EntityFields form={form} entityType={ownedType} omitted={omitted} rulesetId={rulesetId} />
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
