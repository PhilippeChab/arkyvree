import { Box, Tab, Tabs } from "@mui/material";
import { type ElementType, type ReactNode, useEffect, useRef } from "react";

import { DURATION } from "@/client/src/theme/animations.ts";

interface SectionContentProps {
  children: ReactNode;
}

interface SectionTabPanelProps {
  children: ReactNode;
  /** A tab the page keeps mounted while another shows */
  hidden?: boolean;
}

interface SectionTabsProps<K extends string> {
  "aria-label": string;
  onChange: (key: K) => void;
  /** Warm a tab's data before it is clicked. */
  onTabHover?: (key: K) => void;
  tabs: SectionTab<K>[];
  value: K;
}

export interface SectionTab<K extends string> {
  icon: ElementType;
  key: K;
  label: ReactNode;
}

/** A detail page tab's content: the page's column, as wide as it (the app's page width). */
export function SectionContent({ children }: SectionContentProps) {
  return <Box sx={{ width: "100%" }}>{children}</Box>;
}

/** A record page's tab panel: its tab's content, 56px under the tabs (the page's 32px, then its own 24px) and above its end. */
export function SectionTabPanel({ children, hidden }: SectionTabPanelProps) {
  return (
    <Box role="tabpanel" hidden={hidden} sx={{ py: 3 }}>
      {children}
    </Box>
  );
}

/** Scrollable pill tabs switching the sections of a detail page. */
export function SectionTabs<K extends string>({
  tabs,
  value,
  onChange,
  onTabHover,
  "aria-label": ariaLabel,
}: SectionTabsProps<K>) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const settleDelay = DURATION.moderate;

  // Tabs scrolls the selected tab into view before its scroll buttons appear and narrow the strip,
  // which can leave the tab half hidden: bring it back whenever the strip's width changes. Only once
  // Tabs' own scroll animation (the standard duration) is over, or it would undo the correction.
  useEffect(() => {
    const scroller = tabsRef.current?.querySelector<HTMLElement>(".MuiTabs-scroller");
    if (!scroller) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const showSelectedTab = () => {
      const tab = scroller.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (!tab) return;
      const strip = scroller.getBoundingClientRect();
      const { left, right } = tab.getBoundingClientRect();
      if (left < strip.left) scroller.scrollLeft += left - strip.left;
      else if (right > strip.right) scroller.scrollLeft += right - strip.right;
    };
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(showSelectedTab, settleDelay);
    });
    observer.observe(scroller);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [settleDelay]);

  return (
    <Box sx={{ borderRadius: 2, bgcolor: "action.hover", p: 1 }}>
      <Tabs
        ref={tabsRef}
        value={value}
        onChange={(_, key: K) => onChange(key)}
        aria-label={ariaLabel}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{
          "& .MuiTabs-indicator": { height: 3, borderRadius: 1.5 },
          "& .MuiTab-root": {
            textTransform: "none",
            fontWeight: 600,
            fontSize: "0.875rem",
            minHeight: 48,
            borderRadius: 1,
            mx: 0.5,
            "&:hover": { bgcolor: "action.hover" },
            "&.Mui-selected": { bgcolor: "background.default", boxShadow: 1 },
          },
          "& .MuiTabs-scrollButtons.Mui-disabled": { opacity: 0.3 },
        }}
      >
        {tabs.map((tab) => (
          <Tab
            key={tab.key}
            value={tab.key}
            icon={<tab.icon />}
            label={tab.label}
            iconPosition="start"
            onMouseEnter={onTabHover && (() => onTabHover(tab.key))}
          />
        ))}
      </Tabs>
    </Box>
  );
}
