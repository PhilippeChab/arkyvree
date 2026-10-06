/**
 * The emails' look: their palette and font, and the styles their templates share; and the app's address they link to.
 */

import type { CSSProperties } from "react";

export const APP_URL = process.env.APP_URL || "http://localhost:5173";

export const colors = {
  primary: "#8d1e1e",
  text: "#3e2723",
  textMuted: "#5d4037",
  paper: "#ffffff",
  parchment: "#f5f1e8",
  divider: "#e3d5b8",
};

export const fontStack = '"Lora", "Georgia", "Times New Roman", serif';

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
