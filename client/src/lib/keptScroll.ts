import { isRecord } from "@/shared/isRecord.ts";

/**
 * The router state of a navigation that keeps the page's scroll: the same page moving itself to another address, as a
 * ruleset entity's page does to the copy a copy-on-write made (`useCopyOnWrite`). Every other navigation eases back to
 * the top (`AppMain`).
 */
export const KEPT_SCROLL = { keepScroll: true } as const;

/** Whether a navigation's router state keeps the page's scroll (`KEPT_SCROLL`). */
export function keepsScroll(state: unknown) {
  return isRecord(state) && state.keepScroll === true;
}
