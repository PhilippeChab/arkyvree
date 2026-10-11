import { useState } from "react";

/**
 * Calls `onChange` in the render that sees `value` change, not the first: how a component resets the state a prop
 * drives, React's alternative to an effect that sets state. `onChange` sets the component's own state.
 */
export function useOnChange<T>(value: T, onChange: (value: T) => void) {
  const [seen, setSeen] = useState(value);
  if (!Object.is(seen, value)) {
    setSeen(value);
    onChange(value);
  }
}
