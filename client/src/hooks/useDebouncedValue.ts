import { useEffect, useState } from "react";

/** How long a value waits to stop changing: a search's typing. */
const DEBOUNCE_MS = 300;

/** `value` once it has stopped changing for `DEBOUNCE_MS`. An emptied value (a cleared search) applies at once. */
export function useDebouncedValue<T>(value: T): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), value === "" ? 0 : DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);

  return value === "" ? value : debouncedValue;
}
