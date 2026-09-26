import React, { forwardRef } from "react";

import { lockableScroll } from "@/client/src/lib/listboxScroll.ts";

/**
 * Listbox that preserves scroll position when options are appended (infinite scroll).
 * MUI's Autocomplete resets scrollTop when options change — this intercepts that reset.
 */
export const ScrollSafeListbox = forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(
  function ScrollSafeListbox(props, ref) {
    return (
      <ul
        {...props}
        ref={(node) => {
          if (node) lockableScroll(node);
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
      />
    );
  },
);
