import { Button, Heading, Section, Text } from "@react-email/components";

import { APP_URL, EmailLayout, styles } from "./EmailLayout.tsx";

interface CharacterContributorInvitationEmailProps {
  inviteeName?: string;
  inviterName?: string;
  characterName?: string;
  contributorId: string;
}

export const CharacterContributorInvitationEmail = ({
  inviteeName = "User",
  inviterName = "Someone",
  characterName = "a character",
  contributorId,
}: CharacterContributorInvitationEmailProps) => (
  <EmailLayout
    preview={`You've been invited to contribute to ${characterName}`}
  >
    <Heading style={styles.heading}>Character Contributor Invitation</Heading>
    <Text style={styles.text}>Hi {inviteeName},</Text>
    <Text style={styles.text}>
      {inviterName} has invited you to contribute to{" "}
      <strong>{characterName}</strong>. As a contributor you can edit the
      character and print its sheet.
    </Text>
    <Section style={styles.buttonContainer}>
      <Button
        style={styles.button}
        href={`${APP_URL}/character-contributor-invite/${contributorId}`}
      >
        View Invitation
      </Button>
    </Section>
  </EmailLayout>
);

export default CharacterContributorInvitationEmail;
