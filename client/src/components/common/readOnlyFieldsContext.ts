/** Whether the fields under it are a viewer's to read: what `ReadOnlyFields` provides, and `useReadOnlyFields` reads. */

import { createContext } from "react";

export const ReadOnlyFieldsContext = createContext(false);
