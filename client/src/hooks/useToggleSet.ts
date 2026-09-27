import { useCallback, useState } from "react";

/** Keys switched on and off one at a time (expanded rows, open groups), and a reset. */
export function useToggleSet<T = string>() {
  const [set, setSet] = useState<ReadonlySet<T>>(() => new Set());

  const toggle = useCallback((key: T) => {
    setSet((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSet(new Set()), []);

  return [set, toggle, clear] as const;
}
