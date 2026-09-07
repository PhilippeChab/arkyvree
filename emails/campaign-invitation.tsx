import { Button, Heading, Section, Text } from "@react-email/components";

import { APP_URL, EmailLayout, styles } from "./EmailLayout.tsx";

interface CampaignInvitationEmailProps {
  inviteeName?: string;
  inviterName?: string;
  campaignName?: string;
  inviteId: string;
}

export const CampaignInvitationEmail = ({
  inviteeName = "User",
  inviterName = "Someone",
  campaignName = "a campaign",
  inviteId,
}: CampaignInvitationEmailProps) => (
  <EmailLayout preview={`You've been invited to join ${campaignName}`}>
    <Heading style={styles.heading}>Campaign Invitation</Heading>
    <Text style={styles.text}>Hi {inviteeName},</Text>
    <Text style={styles.text}>
      {inviterName} has invited you to join <strong>{campaignName}</strong>.
    </Text>
    <Section style={styles.buttonContainer}>
      <Button
        style={styles.button}
        href={`${APP_URL}/campaign-invite/${inviteId}`}
      >
        View Invitation
      </Button>
    </Section>
  </EmailLayout>
);

export default CampaignInvitationEmail;
