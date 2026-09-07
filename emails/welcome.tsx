import { Heading, Text } from "@react-email/components";

import { EmailLayout, styles } from "./EmailLayout.tsx";

interface WelcomeEmailProps {
  username?: string;
}

export const WelcomeEmail = ({ username = "User" }: WelcomeEmailProps) => (
  <EmailLayout preview="Welcome to Arkyvree!">
    <Heading style={styles.heading}>Welcome to Arkyvree!</Heading>
    <Text style={styles.text}>Hi {username},</Text>
    <Text style={styles.text}>
      Thanks for joining! You can now create and manage your characters,
      campaigns, and rulesets.
    </Text>
    <Text style={styles.text}>
      Get started by creating your first character — your party is waiting.
    </Text>
  </EmailLayout>
);

export default WelcomeEmail;
