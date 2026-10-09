import { Box } from "@mui/material";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { DURATION, transitionOf } from "@/client/src/theme/animations.ts";

interface CrossfadeProps {
  first: ReactNode;
  second: ReactNode;
  showFirst: boolean;
}

export function Crossfade({ showFirst, first, second }: CrossfadeProps) {
  const firstRef = useRef<HTMLDivElement>(null);
  const secondRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  // The shown child's height, as it's shown and as it resizes (a path browser's list loading): an observer reports its
  // size as it starts observing too
  useEffect(() => {
    const active = showFirst ? firstRef.current : secondRef.current;
    if (!active) return;
    const observer = new ResizeObserver(() => {
      setHeight(active.scrollHeight);
    });
    observer.observe(active);
    return () => observer.disconnect();
  }, [showFirst]);

  return (
    <Box
      sx={{
        position: "relative",
        height: height ?? "auto",
        transition: transitionOf(["height"], DURATION.brisk),
        overflow: "hidden",
      }}
    >
      <Box
        ref={firstRef}
        sx={{
          position: showFirst ? "relative" : "absolute",
          top: 0,
          left: 0,
          right: 0,
          opacity: showFirst ? 1 : 0,
          transition: transitionOf(["opacity"], DURATION.brisk),
          pointerEvents: showFirst ? "auto" : "none",
        }}
      >
        {first}
      </Box>
      <Box
        ref={secondRef}
        sx={{
          position: showFirst ? "absolute" : "relative",
          top: 0,
          left: 0,
          right: 0,
          opacity: showFirst ? 0 : 1,
          transition: transitionOf(["opacity"], DURATION.brisk),
          pointerEvents: showFirst ? "none" : "auto",
        }}
      >
        {second}
      </Box>
    </Box>
  );
}
