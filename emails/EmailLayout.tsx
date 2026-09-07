import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";

export const APP_URL = process.env.APP_URL || "http://localhost:5173";

interface EmailLayoutProps {
  preview: string;
  children: ReactNode;
}

export const EmailLayout = ({ preview, children }: EmailLayoutProps) => (
  <Html>
    <Head />
    <Preview>{preview}</Preview>
    <Body style={body}>
      <Container style={container}>
        <Section style={header}>
          <Img
            src={`${APP_URL}/pwa-192x192.png`}
            width={64}
            height={64}
            alt="Arkyvree"
            style={logo}
          />
          <Text style={wordmark}>Arkyvree</Text>
        </Section>
        <Hr style={accentBar} />
        {children}
        <Hr style={divider} />
        <Text style={footer}>
          © {new Date().getFullYear()} Arkyvree · Happy adventuring
        </Text>
      </Container>
    </Body>
  </Html>
);

const colors = {
  primary: "#8d1e1e",
  text: "#3e2723",
  textMuted: "#5d4037",
  paper: "#ffffff",
  parchment: "#f5f1e8",
  divider: "#e3d5b8",
};

const fontStack = '"Lora", "Georgia", "Times New Roman", serif';

const body: CSSProperties = {
  backgroundColor: colors.parchment,
  fontFamily: fontStack,
  margin: 0,
  padding: "32px 16px",
};

const container: CSSProperties = {
  backgroundColor: colors.paper,
  margin: "0 auto",
  maxWidth: "580px",
  borderRadius: "8px",
  overflow: "hidden",
  boxShadow: "0 1px 3px rgba(62, 39, 35, 0.12)",
};

const header: CSSProperties = {
  textAlign: "center",
  padding: "36px 48px 0",
};

const logo: CSSProperties = {
  margin: "0 auto",
  display: "block",
};

const wordmark: CSSProperties = {
  color: colors.primary,
  fontFamily: fontStack,
  fontSize: "26px",
  fontWeight: 600,
  letterSpacing: "0.02em",
  margin: "12px 0 0",
  textAlign: "center",
};

const accentBar: CSSProperties = {
  border: "none",
  borderTop: `3px solid ${colors.primary}`,
  margin: "24px 0 0",
};

const divider: CSSProperties = {
  border: "none",
  borderTop: `1px solid ${colors.divider}`,
  margin: "24px 48px 0",
};

const footer: CSSProperties = {
  color: colors.textMuted,
  fontFamily: fontStack,
  fontSize: "13px",
  lineHeight: "20px",
  textAlign: "center",
  padding: "16px 48px 36px",
  margin: 0,
};

export const styles = {
  heading: {
    color: colors.primary,
    fontFamily: fontStack,
    fontSize: "26px",
    fontWeight: 600,
    letterSpacing: "0.01em",
    margin: "32px 0 16px",
    padding: "0 48px",
  } as CSSProperties,
  text: {
    color: colors.text,
    fontFamily: fontStack,
    fontSize: "16px",
    lineHeight: "26px",
    margin: "12px 0",
    padding: "0 48px",
  } as CSSProperties,
  buttonContainer: {
    padding: "16px 48px 8px",
    textAlign: "center",
  } as CSSProperties,
  button: {
    backgroundColor: colors.primary,
    borderRadius: "6px",
    color: "#ffffff",
    fontFamily: fontStack,
    fontSize: "16px",
    fontWeight: 500,
    textDecoration: "none",
    textAlign: "center",
    display: "inline-block",
    padding: "14px 32px",
    letterSpacing: "0.04em",
  } as CSSProperties,
  codeContainer: {
    padding: "16px 48px",
    textAlign: "center",
  } as CSSProperties,
  code: {
    backgroundColor: colors.parchment,
    border: `1px solid ${colors.divider}`,
    borderRadius: "8px",
    color: colors.text,
    fontFamily: '"Courier New", Courier, monospace',
    fontSize: "32px",
    fontWeight: 700,
    letterSpacing: "10px",
    padding: "20px 28px",
    display: "inline-block",
    margin: 0,
  } as CSSProperties,
  muted: {
    color: colors.textMuted,
    fontFamily: fontStack,
    fontSize: "14px",
    lineHeight: "22px",
    margin: "12px 0",
    padding: "0 48px",
  } as CSSProperties,
};
