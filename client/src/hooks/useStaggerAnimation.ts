import { useState } from "react";

export function useStaggerAnimation() {
  const [offset, setOffset] = useState(0);

  return { offset, updateOffset: setOffset };
}
