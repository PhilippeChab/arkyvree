import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import {
  type PowerFormData,
  PowerFormFields,
  toEntityBody,
  toEntityForm,
  withEntityFields,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { byName, EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import type { Power } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import {
  useEntityColumns,
  useEntityFields,
  useEntityForm,
  useRulesetRules,
} from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import type { EditorProps } from "./renderEditor.tsx";

/** The power's aptitudes with their levels, in the form's (name) order. */
function linkedAptitudes(power: Power) {
  return power.powersAptitudesInRules
    .flatMap((pa) => (pa.aptitudesInRule ? [{ ...pa.aptitudesInRule, level: pa.level }] : []))
    .sort(byName);
}

/**
 * A power's form: its columns (`columns`), its aptitudes each at its level (none: no `level` key, so clearing one
 * leaves the form clean), and its fields.
 */
function toPowerForm(
  power: Power,
  columns: readonly EntityField[],
  fields: readonly EntityField[] | undefined,
): PowerFormData {
  const values: PowerFormData = {
    ...toEntityForm<PowerFormData>(columns, power),
    aptitudes: linkedAptitudes(power).map(({ id, level }) => (level == null ? { id } : { id, level })),
  };
  return withEntityFields(values, fields, power);
}

/** A power's details, named in its ruleset's words (a 3.5 power is a "Spell"). */
export function PowerEditor({
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
  const { columns } = useEntityColumns(rulesetId, "powers");
  const label = entityTypeLabel("powers", useRulesetRules(rulesetId).rules?.words);
  const { form, save } = useEntityForm({
    empty: { ...toEntityForm<PowerFormData>(columns), aptitudes: [] },
    values: toPowerForm(power, columns, fields),
    formKey: recordKey,
    adoptKey,
    updatedAt: power.updatedAt,
    locked,
    rulesetId,
    entityId,
    followCopy,
    storeSaved: refetchSaved,
    listKey: QUERY_KEYS.rulesets.section(rulesetId, "powers"),
    label,
    saveFn: (data: PowerFormData, updatedAt: string | undefined) =>
      parseResponse(
        rpc.api.rulesets[":id"].powers[":powerId"].$put({
          param: { id: rulesetId, powerId: entityId },
          json: { ...toEntityBody<PowerFormData, PowerFormData>(columns, data), updatedAt },
        }),
      ),
  });

  return (
    <EntityDetailsCard
      title={`${label} Details`}
      form={{
        fields: (
          <PowerFormFields form={form} rulesetId={rulesetId} context={{ knownAptitudes: linkedAptitudes(power) }} />
        ),
        ...save,
      }}
    />
  );
}
