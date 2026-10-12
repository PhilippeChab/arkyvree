import type { ReactNode } from "react";

import { ReadOnlyFieldsContext } from "./readOnlyFieldsContext.ts";

/** What `ReadOnlyFields` takes: whether the viewer only reads the form it holds. */
interface ReadOnlyFieldsProps {
  children: ReactNode;
  readOnly: boolean;
}

/**
 * A form a viewer who can't edit it reads: its fields, the shared ones and any input that asks `useReadOnlyFields`,
 * show their values as they are, read-only (never disabled), and its form shows no Save (`EntityDetailsCard`).
 */
export function ReadOnlyFields({ children, readOnly }: ReadOnlyFieldsProps) {
  return <ReadOnlyFieldsContext.Provider value={readOnly}>{children}</ReadOnlyFieldsContext.Provider>;
}
