import { Alert, Box, Button, Container, FormControlLabel, Stack, Switch, Typography } from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";

import { DiceSpinner, PageError, PageLoader, PageTransition, Panel } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { usePageTitle, useSearchParam } from "@/client/src/hooks/index.ts";
import { APP_NAME } from "@/client/src/lib/brand.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { oauthAuthorizationQuery } from "./oauthQueries.ts";

interface ConsentCardProps {
  children: ReactNode;
  title: string;
}

interface ConsentFormProps {
  authorizationId: string;
}

/** The consent page's column: its card stands alone, centred, deeper under the app bar than a page's content. */
const COLUMN_SX = { py: { xs: 4, sm: 8 } } as const;

/**
 * Why a sign-in couldn't start, by the code the server sends: the page words it, never the address's own text (a link
 * anyone can write).
 */
const CONSENT_ERRORS: Record<string, string> = {
  unknown_app: "The app that sent you here can't be found: try connecting it again.",
  unlisted_redirect: "The app asked to send you back to an address it doesn't list: try connecting it again.",
};

/** The consent page's card: its title, what it says, and its answers. */
function ConsentCard({ title, children }: ConsentCardProps) {
  return (
    <PageTransition>
      <Container maxWidth="sm" sx={COLUMN_SX}>
        <Panel>
          <Stack spacing={3}>
            <Typography variant="h5" component="h1">
              {title}
            </Typography>
            {children}
          </Stack>
        </Panel>
      </Container>
    </PageTransition>
  );
}

/**
 * An app's sign-in answered: allowed, reading alone or not, or turned down. Either answer sends the browser back to the
 * app, which reads it.
 */
function ConsentForm({ authorizationId }: ConsentFormProps) {
  const snackbar = useSnackbar();
  const { data: authorization, error } = useQuery(oauthAuthorizationQuery(authorizationId));
  const [readOnly, setReadOnly] = useState<boolean | null>(null);
  const answers = rpc.auth.oauth.authorizations[":id"];
  const answerMutation = useMutation({
    mutationFn: (allow: boolean) =>
      allow
        ? parseResponse(answers.approve.$post({ json: { readOnly: !!readOnly }, param: { id: authorizationId } }))
        : parseResponse(answers.deny.$post({ param: { id: authorizationId } })),
    // Back to the app, at an address the server checked: an https one, or an http one to this device, never a script's
    onSuccess: ({ redirectTo }) => {
      if (!/^https?:$/.test(new URL(redirectTo).protocol)) throw new Error("The app's address isn't a web address");
      window.location.assign(redirectTo);
    },
    onError: (error) => snackbar.error(error, "Failed to answer the app"),
  });

  if (!authorization && !error) return <PageLoader />;
  if (!authorization) {
    return (
      <PageError message={loadFailureMessage("Sign-in", error)} backLabel="Back to Dashboard" backTo="/dashboard" />
    );
  }

  const chosenReadOnly = readOnly ?? authorization.readOnlyAsked;
  const { client, redirectHost, redirectsToDevice } = authorization;
  const answering = answerMutation.isPending;
  return (
    <ConsentCard title={`Connect ${client.name}?`}>
      <Typography variant="body1">
        <strong>{client.name}</strong>, from <strong>{new URL(client.url).host}</strong>, wants to use your {APP_NAME}{" "}
        account: it would read your characters, rulesets and campaigns, and change them as you can, unless it only
        reads.
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Connecting sends you back to <strong>{redirectHost}</strong>.
      </Typography>
      {redirectsToDevice && (
        <Alert severity="warning">
          It sends you back to a program on this device: connect it only if you started it yourself, such as Claude
          Code.
        </Alert>
      )}
      <Box>
        <FormControlLabel
          label="Read Only"
          control={
            <Switch
              checked={chosenReadOnly}
              onChange={(event) => setReadOnly(event.target.checked)}
              disabled={answering}
            />
          }
        />
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {chosenReadOnly ? "It reads what you can, and changes nothing." : "It reads and changes what you can."}
        </Typography>
      </Box>
      <Stack direction="row" spacing={2} sx={{ justifyContent: "flex-end" }}>
        <Button variant="outlined" onClick={() => answerMutation.mutate(false)} disabled={answering}>
          <DiceSpinner size="small" loading={answering && answerMutation.variables === false}>
            Cancel
          </DiceSpinner>
        </Button>
        <Button variant="contained" onClick={() => answerMutation.mutate(true)} disabled={answering}>
          <DiceSpinner size="small" loading={answering && answerMutation.variables === true}>
            Connect
          </DiceSpinner>
        </Button>
      </Stack>
    </ConsentCard>
  );
}

/**
 * The consent page an app (Claude, ChatGPT) sends its user to as it connects to the MCP server: the app and where it
 * sends them back, and their answer, reading alone or not. An app the server couldn't start a sign-in for (`error`) is
 * said so here, the app's own page never reached.
 */
export default function ConsentPage() {
  usePageTitle("Connect an App");
  const { value: authorizationId } = useSearchParam("authorization");
  const { value: error } = useSearchParam("error");
  if (error || !authorizationId) {
    return (
      <ConsentCard title="Can't Connect This App">
        <Typography variant="body1">
          {Object.hasOwn(CONSENT_ERRORS, error)
            ? CONSENT_ERRORS[error]
            : "This page answers an app's sign-in: start connecting the app again."}
        </Typography>
        <Box>
          <Button variant="contained" component={Link} to="/dashboard">
            Back to Dashboard
          </Button>
        </Box>
      </ConsentCard>
    );
  }
  return <ConsentForm authorizationId={authorizationId} />;
}
