import { Stack } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type InferRequestType, type InferResponseType, parseResponse } from "hono/client";

import {
  DiceSpinner,
  LoadError,
  Panel,
  ReadOnlyFields,
  SaveButton,
  SectionContent,
} from "@/client/src/components/common/index.ts";
import { useRulesetPermissions } from "@/client/src/hooks/index.ts";
import { EntityFields, withSavedFields } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { rulesetSettingsQuery } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionProps.ts";
import { useEntityFields, useEntityForm } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** The ruleset's Settings, as the API answers them: its own fields' values. */
type Settings = InferResponseType<(typeof rpc.api.rulesets)[":id"]["settings"]["$get"], 200>;

/** The Settings' form: the ruleset's own fields, as their save sends them. */
type SettingsFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["settings"]["$put"]>["json"];

/** The Settings' form before they load. */
const EMPTY_SETTINGS: SettingsFormData = { fields: {} };

/** Nowhere to follow: a ruleset's Settings are its own, never a copy's. */
function followNoCopy() {}

/**
 * A ruleset's Settings: its own fields, as its rules declare them (the skill points' ability), each saying what it's
 * for. A fork holds its source's until it saves its own. Who edits its content edits them; anyone else reads them.
 */
export function SettingsSection({ ruleset }: RulesetSectionProps) {
  const queryClient = useQueryClient();
  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);
  const settingsQuery = rulesetSettingsQuery(ruleset.id);
  const { data: settings, error } = useQuery(settingsQuery);
  const { fields } = useEntityFields(ruleset.id, "rulesets");
  const toFormValues = (saved: Settings) => withSavedFields(EMPTY_SETTINGS, fields, saved.fields);
  const { form, save } = useEntityForm({
    empty: EMPTY_SETTINGS,
    values: settings && toFormValues(settings),
    formKey: ruleset.id,
    rulesetId: ruleset.id,
    entityId: ruleset.id,
    label: "Settings",
    listKey: settingsQuery.queryKey,
    saveFn: (data: SettingsFormData) =>
      parseResponse(rpc.api.rulesets[":id"].settings.$put({ param: { id: ruleset.id }, json: data })),
    toFormValues,
    storeSaved: (saved) => {
      queryClient.setQueryData(settingsQuery.queryKey, saved);
    },
    followCopy: followNoCopy,
  });

  return (
    <SectionContent>
      {settings ? (
        <Panel>
          {canEdit ? (
            <Stack component="form" noValidate onSubmit={save.onSubmit} spacing={3}>
              <EntityFields form={form} entityType="rulesets" rulesetId={ruleset.id} help />
              <SaveButton canSave={save.canSave} pending={save.isSaving} />
            </Stack>
          ) : (
            // The same fields, read-only, which nothing submits
            <ReadOnlyFields readOnly>
              <EntityFields form={form} entityType="rulesets" rulesetId={ruleset.id} help />
            </ReadOnlyFields>
          )}
        </Panel>
      ) : error ? (
        <LoadError what="Settings" error={error} />
      ) : (
        <DiceSpinner sx={{ py: 4 }} />
      )}
    </SectionContent>
  );
}
