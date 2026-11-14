import { Stack, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { DiceSpinner, LoadError, OptionToggle, Panel, PanelLead } from "@/client/src/components/common/index.ts";
import { PersonAddIcon, PrivateIcon, PublicIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { APP_NAME } from "@/client/src/lib/brand.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import type { SignUpPolicy } from "@/shared/enums.ts";

import { adminSettingsQuery } from "./adminQueries.ts";

/** What each sign-up setting means, under its choice. */
const SIGN_UP_CAPTIONS: Record<SignUpPolicy, string> = {
  Open: "Anyone who reaches this address can make an account.",
  "Invite Only":
    "Only someone invited to a campaign, a ruleset or a character can make an account, with the address the invite went to.",
  Closed: "Nobody can make an account. Invites go only to people who already have one.",
};

const SIGN_UP_OPTIONS = [
  { value: "Open", label: "Open", icon: PublicIcon },
  { value: "Invite Only", label: "Invite Only", icon: PersonAddIcon },
  { value: "Closed", label: "Closed", icon: PrivateIcon },
] as const;

/** Who may make an account on the instance: its admins choose among anyone, the invited, or nobody. */
export function SignUpPanel() {
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const { data: settings, error } = useQuery(adminSettingsQuery());

  const updateMutation = useMutation({
    mutationFn: (signUpPolicy: SignUpPolicy) => parseResponse(rpc.api.admin.settings.$put({ json: { signUpPolicy } })),
    onSuccess: (updated) => {
      queryClient.setQueryData(QUERY_KEYS.admin.settings, updated);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.auth.signUpPolicy });
      snackbar.success("Sign-up setting saved");
    },
    onError: (error) => snackbar.error(error, "Failed to save the sign-up setting"),
  });

  return (
    <Panel spacing={3}>
      <Stack spacing={1}>
        <PanelLead>Sign-Up</PanelLead>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Choose who can make an account on this {APP_NAME}. People who already have one keep it, whatever you choose.
        </Typography>
      </Stack>
      {!settings && !error && <DiceSpinner sx={{ py: 4 }} />}
      {!settings && !!error && <LoadError what="the sign-up setting" error={error} />}
      {settings && (
        <OptionToggle<SignUpPolicy>
          label="Who Can Sign Up"
          options={SIGN_UP_OPTIONS}
          value={updateMutation.isPending ? updateMutation.variables : settings.signUpPolicy}
          onChange={(value) => updateMutation.mutate(value)}
          disabled={updateMutation.isPending}
          caption={SIGN_UP_CAPTIONS[updateMutation.isPending ? updateMutation.variables : settings.signUpPolicy]}
        />
      )}
    </Panel>
  );
}
