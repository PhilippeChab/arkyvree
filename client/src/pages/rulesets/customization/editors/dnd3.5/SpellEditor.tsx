import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import {
  EMPTY_SPELL,
  spellAptitude,
  type SpellFormData,
  SpellFormFields,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { withEntityFields } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { byName, EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import type { EditorProps } from "@/client/src/pages/rulesets/customization/editors/renderEditor.tsx";
import type { Power } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { useEntityFields, useEntityForm, useRulesetSaves } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** The spell's aptitudes with their levels, in the form's (name) order. */
function linkedAptitudes(power: Power) {
  return power.powersAptitudesInRules
    .flatMap((pa) => (pa.aptitudesInRule ? [{ ...pa.aptitudesInRule, level: pa.level }] : []))
    .sort(byName);
}

function toSpellForm(power: Power, fields: readonly EntityField[] | undefined): SpellFormData {
  const values: SpellFormData = {
    name: power.name,
    description: power.description ?? "",
    saveId: power.saveId ?? "",
    saveEffect: power.saveEffect ?? "",
    aptitudes: linkedAptitudes(power).map((a) => spellAptitude(a.id, a.level)),
  };
  return withEntityFields(values, fields, power);
}

export function SpellEditor({
  rulesetId,
  entityId,
  recordKey,
  adoptKey,
  entity: power,
  locked,
  followCopy,
  refetchSaved,
}: EditorProps<Power>) {
  const { fields } = useEntityFields(rulesetId, "powers");
  const { data: saves = [], error: savesError } = useRulesetSaves(rulesetId);
  const { form, save } = useEntityForm({
    empty: EMPTY_SPELL,
    values: toSpellForm(power, fields),
    formKey: recordKey,
    adoptKey,
    updatedAt: power.updatedAt,
    locked,
    rulesetId,
    entityId,
    followCopy,
    storeSaved: refetchSaved,
    listKey: QUERY_KEYS.rulesets.section(rulesetId, "powers"),
    label: "Spell",
    saveFn: (data: SpellFormData, updatedAt: string | undefined) =>
      parseResponse(
        rpc.api.rulesets[":id"].powers[":powerId"].$put({
          param: { id: rulesetId, powerId: entityId },
          json: { ...data, updatedAt },
        }),
      ),
  });

  return (
    <EntityDetailsCard
      title="Spell Details"
      form={{
        fields: (
          <SpellFormFields
            form={form}
            rulesetId={rulesetId}
            saves={saves}
            savesError={savesError}
            knownAptitudes={linkedAptitudes(power)}
          />
        ),
        ...save,
      }}
    />
  );
}
