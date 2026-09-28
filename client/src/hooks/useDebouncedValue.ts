import { useEffect, useState } from "react";

/** `value` once it has stopped changing for `delay` ms. An emptied value (a cleared search) applies at once. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), value === "" ? 0 : delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return value === "" ? value : debouncedValue;
}
