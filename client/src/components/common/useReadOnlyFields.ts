import { useContext } from "react";

import { ReadOnlyFieldsContext } from "./readOnlyFieldsContext.ts";

/** Whether a form's fields are read-only here: under `ReadOnlyFields`, for a viewer who can't edit what they show. */
export function useReadOnlyFields() {
  return useContext(ReadOnlyFieldsContext);
}
