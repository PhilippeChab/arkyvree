import type React from "react";

// Listboxes patched by `lockableScroll`, each mapped to the function that
// holds its scroll position while the next page of options is appended.
const scrollLocks = new WeakMap<Element, () => void>();

/**
 * Make a listbox ignore the scroll reset MUI's Autocomplete performs when its
 * options change, for the moment after a lock (see `createListboxScrollHandler`).
 */
export function lockableScroll(el: HTMLElement): void {
  if (scrollLocks.has(el)) return;

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

  scrollLocks.set(el, () => {
    locked = true;
    setTimeout(() => { locked = false; }, 500);
  });
}

interface InfiniteList {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
}

/**
 * `onScroll` handler for a listbox backed by one or more infinite queries:
 * near the bottom it fetches the next page of each list that has one. Pair it
 * with `ScrollSafeListbox` so the appended options don't reset the scroll.
 */
export function createListboxScrollHandler(lists: InfiniteList | InfiniteList[]) {
  return (event: React.UIEvent<HTMLElement>) => {
    const target = event.currentTarget;
    if (target.scrollHeight - target.scrollTop > target.clientHeight + 50) return;
    const pending = (Array.isArray(lists) ? lists : [lists])
      .filter((list) => list.hasNextPage && !list.isFetchingNextPage);
    if (pending.length === 0) return;
    scrollLocks.get(target)?.();
    for (const list of pending) list.fetchNextPage();
  };
}
