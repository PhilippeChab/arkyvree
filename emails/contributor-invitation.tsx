import { Button, Heading, Section, Text } from "@react-email/components";

import { EmailLayout } from "./EmailLayout.tsx";
import { APP_URL, styles } from "./emailStyles.ts";

interface ContributorInvitationEmailProps {
  inviteeName?: string;
  inviterName?: string;
  rulesetName?: string;
  role?: string;
  contributorId: string;
}

export function ContributorInvitationEmail({
  inviteeName = "User",
  inviterName = "Someone",
  rulesetName = "a ruleset",
  role = "Editor",
  contributorId,
}: ContributorInvitationEmailProps) {
  return (
    <EmailLayout preview={`You've been invited to contribute to ${rulesetName}`}>
      <Heading style={styles.heading}>Ruleset Contributor Invitation</Heading>
      <Text style={styles.text}>Hi {inviteeName},</Text>
      <Text style={styles.text}>
        {inviterName} has invited you as <strong>{role}</strong> on <strong>{rulesetName}</strong>.
      </Text>
      <Section style={styles.buttonContainer}>
        <Button style={styles.button} href={`${APP_URL}/ruleset-contributor-invite/${contributorId}`}>
          View Invitation
        </Button>
      </Section>
    </EmailLayout>
  );
}

export default ContributorInvitationEmail;
