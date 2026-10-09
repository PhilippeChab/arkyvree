import { sanitizeText } from "@/shared/text.ts";

/** An email address as it's stored: sanitized text (`sanitizeText`), lowercased, which the rate limits key by too. */
export function sanitizeEmail(email: string) {
  return sanitizeText(email).toLowerCase();
}
