import { useRef } from "react";

export function useStaggerAnimation() {
  const offsetRef = useRef(0);

  const updateOffset = (currentCount: number) => {
    offsetRef.current = currentCount;
  };

  return { offset: offsetRef.current, updateOffset };
}
