/** Text as it's stored: Unicode-normalized (NFKC) and trimmed. */
export function sanitizeText(text: string) {
  return text.normalize("NFKC").trim();
}

/** An email address as it's stored: sanitized text, lowercased. */
export function sanitizeEmail(email: string) {
  return sanitizeText(email).toLowerCase();
}
