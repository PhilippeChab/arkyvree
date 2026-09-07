import { Box } from "@mui/material";
import { useEffect, useRef, useState, type ReactNode } from "react";

interface CrossfadeProps {
  showFirst: boolean;
  first: ReactNode;
  second: ReactNode;
  duration?: number;
}

export function Crossfade({ showFirst, first, second, duration = 200 }: CrossfadeProps) {
  const firstRef = useRef<HTMLDivElement>(null);
  const secondRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const active = showFirst ? firstRef.current : secondRef.current;
    if (active) {
      setHeight(active.scrollHeight);
    }
  }, [showFirst]);

  // Also observe resize of the active child (e.g., path browser list loading)
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
        transition: `height ${duration}ms ease`,
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
          transition: `opacity ${duration}ms`,
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
          transition: `opacity ${duration}ms`,
          pointerEvents: showFirst ? "none" : "auto",
        }}
      >
        {second}
      </Box>
    </Box>
  );
}
