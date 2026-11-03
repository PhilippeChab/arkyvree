/**
 * What an action does, which its color shows (docs/ui-buttons.md): a menu's item, a row's action and a dialog's
 * action alike.
 */
export type Intent = "caution" | "default" | "destructive" | "positive";

/**
 * The palette color of each intent: red for what destroys, orange for leaving, green for what goes ahead; the
 * default takes its control's own (grey, a dialog's gold).
 */
export const INTENT_COLORS = {
  caution: "warning",
  default: undefined,
  destructive: "error",
  positive: "success",
} as const satisfies Record<Intent, string | undefined>;
