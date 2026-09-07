import React, { forwardRef, useCallback, useRef } from "react";

/**
 * Listbox that preserves scroll position when options are appended (infinite scroll).
 * MUI's Autocomplete resets scrollTop when options change — this intercepts that reset.
 */
const ScrollSafeListbox = forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(
  function ScrollSafeListbox(props, ref) {
    const innerRef = useRef<HTMLUListElement | null>(null);

    const patchElement = useCallback((el: HTMLUListElement) => {
      if (!el || (el as unknown as Record<string, boolean>).__scrollPatched) return;
      (el as unknown as Record<string, boolean>).__scrollPatched = true;

      let userScrollTop = 0;
      let locked = false;

      const desc = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;

      Object.defineProperty(el, "scrollTop", {
        get() {
          return desc.get!.call(el);
        },
        set(value: number) {
          if (locked && value < userScrollTop - 50) return;
          desc.set!.call(el, value);
        },
        configurable: true,
      });

      el.addEventListener("scroll", () => {
        userScrollTop = desc.get!.call(el) as number;
      }, { passive: true });

      (el as unknown as Record<string, () => void>).__lockScroll = () => {
        locked = true;
        setTimeout(() => { locked = false; }, 500);
      };
    }, []);

    return (
      <ul
        {...props}
        ref={(node) => {
          innerRef.current = node;
          if (node) patchElement(node);
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
      />
    );
  },
);

export { ScrollSafeListbox };
