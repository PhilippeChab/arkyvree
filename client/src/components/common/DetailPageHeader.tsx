import { Box, IconButton, Stack, Tab, Tabs, Typography } from "@mui/material";
import { type ElementType, type MouseEvent, type ReactNode, useEffect, useRef } from "react";
import { Link } from "react-router-dom";

import { ArrowBackIcon, MoreVertIcon } from "@/client/src/components/icons/index.ts";
import { DURATION } from "@/client/src/theme/animations.ts";

interface DetailPageHeaderProps {
  /** Its text, or what renames it (a character's name, clicked) */
  title: ReactNode;
  /** Shown in the title's place while the page's record is renamed */
  titleEditor?: ReactNode;
  /** Inline control after the title, e.g. a star toggle. */
  titleAdornment?: ReactNode;
  /** Where Back goes, a link; without it (a shared sheet's viewer has nowhere to go back to), its corner stays empty */
  backTo?: string;
  /** Opens the page's action menu; the button is hidden when omitted. */
  onMenuOpen?: (event: MouseEvent<HTMLElement>) => void;
  chips?: ReactNode;
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

/** Centered title block of a ruleset, campaign or character page, with back and menu buttons. */
export function DetailPageHeader({
  title,
  titleEditor,
  titleAdornment,
  backTo,
  onMenuOpen,
  chips,
  description,
  children,
}: DetailPageHeaderProps) {
  const cornerButtonSx = { position: "absolute", "&:hover": { bgcolor: "action.hover" } } as const;

  return (
    <Stack
      direction="row"
      sx={{
        alignItems: "center",
        py: 2,
        borderBottom: 1,
        borderColor: "divider",
        position: "relative",
      }}
    >
      {backTo && (
        <IconButton component={Link} to={backTo} size="large" aria-label="Back" sx={{ ...cornerButtonSx, left: 0 }}>
          <ArrowBackIcon />
        </IconButton>
      )}
      {onMenuOpen && (
        <IconButton onClick={onMenuOpen} size="large" aria-label="More Actions" sx={{ ...cornerButtonSx, right: 0 }}>
          <MoreVertIcon />
        </IconButton>
      )}
      <Box sx={{ flexGrow: 1, textAlign: "center", px: { xs: 5, md: 8 } }}>
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "center" }}>
            {titleEditor ?? (
              <Typography component="h1" sx={{ fontWeight: 700, typography: { xs: "h4", md: "h3" } }}>
                {title}
              </Typography>
            )}
            {titleAdornment}
          </Stack>
          <Stack spacing={2}>
            {chips && (
              <Stack direction="row" spacing={1} sx={{ justifyContent: "center", flexWrap: "wrap" }}>
                {chips}
              </Stack>
            )}
            <Typography variant="body1" sx={{ color: "text.secondary", maxWidth: 600, mx: "auto" }}>
              {description}
            </Typography>
          </Stack>
          {children}
        </Stack>
      </Box>
    </Stack>
  );
}

/** A detail page tab's content: the page's centered column, up to 1200px. */
export function SectionContent({ children }: SectionContentProps) {
  return <Box sx={{ width: "100%", maxWidth: 1200, mx: "auto" }}>{children}</Box>;
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
