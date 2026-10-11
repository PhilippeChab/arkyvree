import { Heading, Section, Text } from "@react-email/components";

import { EmailLayout } from "./EmailLayout.tsx";
import { styles } from "./emailStyles.ts";

interface PasswordResetProps {
  code?: string;
}

export function PasswordResetEmail({ code = "000000" }: PasswordResetProps) {
  return (
    <EmailLayout preview={`Your password reset code is ${code}`}>
      <Heading style={styles.heading}>Reset Your Password</Heading>
      <Text style={styles.text}>Enter this code to reset your password:</Text>
      <Section style={styles.codeContainer}>
        <Text style={styles.code}>{code}</Text>
      </Section>
      <Text style={styles.muted}>This code expires in 15 minutes.</Text>
      <Text style={styles.muted}>If you didn't request this, you can safely ignore this email.</Text>
    </EmailLayout>
  );
}

export default PasswordResetEmail;
