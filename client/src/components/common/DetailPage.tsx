import { Box, IconButton, Stack, Tab, Tabs, Typography, useTheme } from "@mui/material";
import { type ElementType, type MouseEvent, type ReactNode, useEffect, useRef } from "react";
import { Link } from "react-router-dom";

import { BackIcon, MoreIcon } from "@/client/src/components/icons/index.ts";

import { type Tag, TagChip } from "./TagChip.tsx";

interface DetailPageHeaderProps {
  title: string;
  /** Inline control after the title, e.g. a star toggle. */
  titleAdornment?: ReactNode;
  /** Where Back goes */
  backTo: string;
  /** Opens the page's action menu; the button is hidden when omitted. */
  onMenuOpen?: (event: MouseEvent<HTMLElement>) => void;
  /** Its facts, beside the title: a status, a visibility… */
  tags?: Tag[];
  description: ReactNode;
  children?: ReactNode;
}

interface SectionContentProps {
  children: ReactNode;
}

interface SectionTabsProps<K extends string> {
  tabs: SectionTab<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Warm a tab's data before it is clicked. */
  onTabHover?: (key: K) => void;
  "aria-label": string;
}

export interface SectionTab<K extends string> {
  key: K;
  label: ReactNode;
  icon: ElementType;
}

/** Centered title block of a ruleset or campaign page, with back and menu buttons. */
export function DetailPageHeader({
  title,
  titleAdornment,
  backTo,
  onMenuOpen,
  tags,
  description,
  children,
}: DetailPageHeaderProps) {
  const cornerButtonSx = { position: "absolute", "&:hover": { bgcolor: "action.hover" } } as const;

  return (
    <Stack
      direction="row"
      sx={{ alignItems: "center", py: 2, borderBottom: 1, borderColor: "divider", position: "relative" }}
    >
      <IconButton component={Link} to={backTo} size="large" aria-label="Back" sx={{ ...cornerButtonSx, left: 0 }}>
        <BackIcon />
      </IconButton>
      {onMenuOpen && (
        <IconButton onClick={onMenuOpen} size="large" aria-label="More actions" sx={{ ...cornerButtonSx, right: 0 }}>
          <MoreIcon />
        </IconButton>
      )}
      <Stack spacing={2} sx={{ flexGrow: 1, textAlign: "center", px: { xs: 5, md: 8 } }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "center" }}>
          <Typography component="h1" sx={{ fontWeight: 700, typography: { xs: "h4", md: "h3" } }}>
            {title}
          </Typography>
          {titleAdornment}
        </Stack>
        {tags && tags.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ justifyContent: "center", flexWrap: "wrap" }}>
            {tags.map((tag) => (
              <TagChip key={tag.label} tag={tag} size="medium" />
            ))}
          </Stack>
        )}
        <Typography sx={{ color: "text.secondary", maxWidth: 600, mx: "auto" }}>{description}</Typography>
        {children}
      </Stack>
    </Stack>
  );
}

/** A detail page tab's content: the page's centered column, up to 1200px. */
export function SectionContent({ children }: SectionContentProps) {
  return (
    <Stack spacing={3} sx={{ width: "100%", maxWidth: 1200, mx: "auto" }}>
      {children}
    </Stack>
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
  const settleDelay = useTheme().transitions.duration.standard;

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
