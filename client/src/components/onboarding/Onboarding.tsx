import {
  DURATION,
  EASING,
  fadeInUp,
  prefersReducedMotion,
} from "@/client/src/lib/animations.ts";
import {
  HelpOutlined as FaqIcon,
  Map as MapIcon,
  MenuBook as RulesetIcon,
  Person as PersonIcon,
} from "@mui/icons-material";
import type { SvgIconComponent } from "@mui/icons-material";
import {
  Backdrop,
  Box,
  Button,
  DialogContent,
  Link,
  MobileStepper,
  Paper,
  Popper,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { Modal } from "@/client/src/components/common/index.ts";
import { HelpOutlined as HelpIcon } from "@mui/icons-material";
import type { Instance } from "@popperjs/core";
import { useEffect, useRef, useState } from "react";

const SIDEBAR_TRANSITION_MS = 380;

interface OnboardingStep {
  icon: SvgIconComponent | null;
  logo?: boolean;
  title: string;
  description: string;
  tooltip?: string;
  mode: "dialog" | "popper";
}

const steps: OnboardingStep[] = [
  {
    icon: null,
    logo: true,
    title: "Welcome to Arkyvree",
    description:
      "A programmable ruleset engine for tabletop RPGs. Build characters and run campaigns on top.",
    mode: "dialog",
  },
  {
    icon: RulesetIcon,
    title: "Rulesets",
    description:
      "The foundation — browse community rulesets, fork them to create your own, and customize rules to fit your table.",
    tooltip:
      "Forking creates your own editable copy of a published ruleset — it inherits all entities and only copies what you change. Extensions let you subscribe to sourcebook content packages that add new feats, items, classes, and more.",
    mode: "popper",
  },
  {
    icon: PersonIcon,
    title: "Characters",
    description:
      "Create characters using any ruleset — build sheets with stats, feats, equipment, and more.",
    mode: "popper",
  },
  {
    icon: MapIcon,
    title: "Campaigns",
    description:
      "Organize your games — create campaigns, invite players, and manage characters together.",
    mode: "popper",
  },
  {
    icon: FaqIcon,
    title: "Learn More",
    description:
      "Want to dive deeper? The {faq} covers rulesets, forking, the customization system, and more.",
    mode: "dialog",
  },
];

interface OnboardingProps {
  open: boolean;
  onClose: () => void;
  activeStep: number;
  onStepChange: (step: number) => void;
  anchorEl: HTMLElement | null;
  isMobile: boolean;
}

export function Onboarding({ open, onClose, activeStep, onStepChange, anchorEl, isMobile }: OnboardingProps) {
  const theme = useTheme();
  const darkMode = theme.palette.mode === "dark";

  const gold = darkMode ? "#f5c542" : "#bf9000";
  const goldFaint = darkMode
    ? "rgba(245, 197, 66, 0.12)"
    : "rgba(191, 144, 0, 0.10)";

  const step = steps[activeStep];
  const isLastStep = activeStep === steps.length - 1;
  const effectiveMode = (isMobile || !anchorEl) ? "dialog" : "popper";

  // Delay popper visibility until sidebar expansion transition completes
  const popperRef = useRef<Instance>(null);
  const wasPopperMode = useRef(false);
  const [popperVisible, setPopperVisible] = useState(false);

  useEffect(() => {
    if (effectiveMode !== "popper") {
      wasPopperMode.current = false;
      setPopperVisible(false);
      return;
    }
    // Already in popper mode (switching between popper steps) — no sidebar transition
    if (wasPopperMode.current) {
      popperRef.current?.update();
      setPopperVisible(true);
      return;
    }
    // Entering popper mode — sidebar is expanding, wait for transition
    setPopperVisible(false);
    wasPopperMode.current = true;
    const timer = setTimeout(() => {
      popperRef.current?.update();
      setPopperVisible(true);
    }, SIDEBAR_TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [effectiveMode, anchorEl]);

  const handleNext = () => {
    if (isLastStep) {
      onClose();
    } else {
      onStepChange(activeStep + 1);
    }
  };

  const handleBack = () => {
    onStepChange(activeStep - 1);
  };

  const handleViewFaq = () => {
    onClose();
    window.open("https://arkyvree.featurebase.app/help", "_blank", "noopener,noreferrer");
  };

  if (!open) return null;

  const gradientBar = (
    <Box
      sx={{
        height: 6,
        background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${gold}, ${theme.palette.secondary.main})`,
      }}
    />
  );

  const stepContent = (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        py: effectiveMode === "dialog" ? { xs: 4, sm: 6 } : 3,
        px: effectiveMode === "dialog" ? { xs: 3, sm: 5 } : 3,
        minHeight: effectiveMode === "dialog" ? { xs: "auto", sm: 380 } : "auto",
      }}
    >
      <Box
        key={activeStep}
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          animation: `${fadeInUp} ${DURATION.normal}ms ${EASING.decelerate} both`,
          [prefersReducedMotion]: { animation: "none" },
        }}
      >
        {/* Icon circle */}
        <Box
          sx={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            mb: 3,
          }}
        >
          <Box
            sx={{
              position: "absolute",
              width: effectiveMode === "dialog" ? 140 : 100,
              height: effectiveMode === "dialog" ? 140 : 100,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${goldFaint} 0%, transparent 70%)`,
              pointerEvents: "none",
            }}
          />
          <Box
            sx={{
              width: effectiveMode === "dialog" ? 88 : 64,
              height: effectiveMode === "dialog" ? 88 : 64,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
              boxShadow: `0 4px 20px ${goldFaint}`,
              position: "relative",
            }}
          >
            {step.logo ? (
              <Box
                component="img"
                src="/pwa-512x512.png"
                alt=""
                sx={{
                  width: effectiveMode === "dialog" ? 48 : 34,
                  height: effectiveMode === "dialog" ? 48 : 34,
                  filter: "drop-shadow(0 2px 8px rgba(191, 144, 0, 0.35))",
                }}
              />
            ) : step.icon ? (
              <step.icon
                sx={{
                  fontSize: effectiveMode === "dialog" ? 44 : 32,
                  color: "white",
                  filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
                }}
              />
            ) : null}
          </Box>
        </Box>

        <Typography
          variant={effectiveMode === "dialog" ? "h5" : "h6"}
          sx={{ fontWeight: 700, mb: 2, letterSpacing: "0.02em" }}
        >
          {step.title}
        </Typography>

        <Box
          sx={{
            width: 60,
            height: 2,
            background: `linear-gradient(90deg, transparent, ${gold}, transparent)`,
            mb: 2,
          }}
        />

        <Typography
          variant="body1"
          sx={{
            color: "text.secondary",
            maxWidth: effectiveMode === "dialog" ? 400 : 300,
            lineHeight: 1.7,
            fontSize: effectiveMode === "popper" ? "0.9rem" : undefined,
          }}
        >
          {step.description.includes("{faq}")
            ? step.description.split("{faq}").map((part, i) => (
                <span key={i}>
                  {part}
                  {i === 0 && (
                    <Link
                      component="button"
                      onClick={handleViewFaq}
                      sx={{ fontSize: "inherit", verticalAlign: "baseline" }}
                    >
                      FAQ
                    </Link>
                  )}
                </span>
              ))
            : step.description}
        </Typography>

        {step.tooltip && (
          <Tooltip title={step.tooltip} arrow placement="top">
            <Box
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                mt: 2,
                color: gold,
                cursor: "help",
                fontSize: "0.85rem",
              }}
            >
              <HelpIcon sx={{ fontSize: 18 }} />
              <Typography variant="caption" sx={{ color: "inherit", fontWeight: 500 }}>
                Forking & Extensions
              </Typography>
            </Box>
          </Tooltip>
        )}
      </Box>
    </Box>
  );

  const stepperDots = (
    <MobileStepper
      variant="dots"
      steps={steps.length}
      position="static"
      activeStep={activeStep}
      sx={{
        justifyContent: "center",
        background: "transparent",
        pb: 0,
        "& .MuiMobileStepper-dot": { mx: 0.5 },
        "& .MuiMobileStepper-dotActive": { backgroundColor: gold },
      }}
      backButton={null}
      nextButton={null}
    />
  );

  const navButtons = (
    <Box sx={{ display: "flex", alignItems: "center", px: 3, pb: 3, pt: 2 }}>
      <Button onClick={onClose} color="inherit" sx={{ opacity: 0.7 }}>
        Skip
      </Button>
      <Box sx={{ flex: 1 }} />
      {activeStep > 0 && (
        <Button onClick={handleBack} color="inherit">
          Back
        </Button>
      )}
      <Button onClick={handleNext} variant="contained">
        {isLastStep ? "Get Started" : "Next"}
      </Button>
    </Box>
  );

  if (effectiveMode === "dialog") {
    return (
      <Modal open onClose={onClose}>
        {gradientBar}
        <DialogContent sx={{ p: 0 }}>
          {stepContent}
        </DialogContent>
        {stepperDots}
        {navButtons}
      </Modal>
    );
  }

  if (!popperVisible) return null;

  return (
    <>
      <Backdrop open sx={{ zIndex: (t) => t.zIndex.drawer + 2 }} onClick={onClose} />
      <Popper
        open
        popperRef={popperRef}
        anchorEl={anchorEl}
        placement="right-start"
        sx={{ zIndex: (t) => t.zIndex.drawer + 3 }}
        modifiers={[{ name: "offset", options: { offset: [0, 16] } }]}
      >
        <Paper elevation={8} sx={{ width: 360, position: "relative" }}>
          {/* Arrow pointing left */}
          <Box
            sx={{
              position: "absolute",
              left: -8,
              top: 20,
              width: 0,
              height: 0,
              borderTop: "8px solid transparent",
              borderBottom: "8px solid transparent",
              borderRight: (t) => `8px solid ${t.palette.background.paper}`,
              filter: "drop-shadow(-2px 0 2px rgba(0,0,0,0.1))",
            }}
          />
          {gradientBar}
          {stepContent}
          {stepperDots}
          {navButtons}
        </Paper>
      </Popper>
    </>
  );
}
