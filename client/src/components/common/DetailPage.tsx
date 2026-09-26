import { ArrowBack, MoreVert as MoreVertIcon } from "@mui/icons-material";
import { Box, IconButton, Tab, Tabs, Typography } from "@mui/material";
import type { ElementType, MouseEvent, ReactNode } from "react";

interface DetailPageHeaderProps {
  title: string;
  /** Inline control after the title, e.g. a star toggle. */
  titleAdornment?: ReactNode;
  onBack: () => void;
  /** Opens the page's action menu; the button is hidden when omitted. */
  onMenuOpen?: (event: MouseEvent<HTMLElement>) => void;
  chips?: ReactNode;
  description: ReactNode;
  children?: ReactNode;
}

/** Centered title block of a ruleset or campaign page, with back and menu buttons. */
export function DetailPageHeader({
  title,
  titleAdornment,
  onBack,
  onMenuOpen,
  chips,
  description,
  children,
}: DetailPageHeaderProps) {
  const cornerButtonSx = { position: "absolute", "&:hover": { bgcolor: "action.hover" } } as const;

  return (
    <Box
      sx={{
        mb: 4,
        display: "flex",
        alignItems: "center",
        py: 2,
        borderBottom: 1,
        borderColor: "divider",
        position: "relative",
      }}
    >
      <IconButton onClick={onBack} size="large" aria-label="Back" sx={{ ...cornerButtonSx, left: 0 }}>
        <ArrowBack />
      </IconButton>
      {onMenuOpen && (
        <IconButton onClick={onMenuOpen} size="large" aria-label="More actions" sx={{ ...cornerButtonSx, right: 0 }}>
          <MoreVertIcon />
        </IconButton>
      )}
      <Box sx={{ flexGrow: 1, textAlign: "center", px: { xs: 5, md: 8 } }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, mb: 1 }}>
          <Typography component="h1" sx={{ fontWeight: 700, typography: { xs: "h4", md: "h3" } }}>
            {title}
          </Typography>
          {titleAdornment}
        </Box>
        {chips && (
          <Box sx={{ display: "flex", justifyContent: "center", gap: 1, mb: 2, flexWrap: "wrap" }}>
            {chips}
          </Box>
        )}
        <Typography variant="body1" sx={{ color: "text.secondary", maxWidth: 600, mx: "auto" }}>
          {description}
        </Typography>
        {children}
      </Box>
    </Box>
  );
}

export interface SectionTab<K extends string> {
  key: K;
  label: ReactNode;
  icon: ElementType;
}

interface SectionTabsProps<K extends string> {
  tabs: SectionTab<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Warm a tab's data before it is clicked. */
  onTabHover?: (key: K) => void;
  "aria-label": string;
}

/** Scrollable pill tabs switching the sections of a detail page. */
export function SectionTabs<K extends string>({
  tabs,
  value,
  onChange,
  onTabHover,
  "aria-label": ariaLabel,
}: SectionTabsProps<K>) {
  return (
    <Box sx={{ borderRadius: 2, bgcolor: "action.hover", p: 1, mb: 4 }}>
      <Tabs
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
