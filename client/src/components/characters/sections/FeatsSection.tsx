import { Box, Collapse, IconButton, Link as MuiLink, Stack, Typography } from "@mui/material";
import { useState } from "react";
import { Link } from "react-router-dom";

import { BlankState } from "@/client/src/components/common/index.ts";
import { ExpandLessIcon, ExpandMoreIcon } from "@/client/src/components/icons/index.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";

import { SheetSection } from "./SheetSection.tsx";

type Feat = CharacterDetail["classes"][string]["levels"][number]["feats"][number];

interface FeatsSectionProps {
  classes: CharacterDetail["classes"];
  virtualFeats?: CharacterDetail["virtualFeats"];
  rulesetId?: string;
  renderFeatExtra?: (feat: Feat) => React.ReactNode;
}

interface FeatRowProps {
  name: React.ReactNode;
  label: string;
  description?: string | null;
  extra?: React.ReactNode;
}

interface GrantedFeatsSectionProps {
  feats: NonNullable<FeatsSectionProps["virtualFeats"]>;
  rulesetId?: string;
}

function FeatRow({ name, label, description, extra }: FeatRowProps) {
  const [open, setOpen] = useState(false);
  const hasExtra = extra != null && extra !== false;

  return (
    <Box sx={{ borderLeft: 4, borderColor: "primary.main", pl: 2 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Typography
          component="h3"
          sx={{ fontWeight: 600, color: "primary.main", typography: { xs: "body1", sm: "h6" } }}
        >
          {name}
        </Typography>
        {hasExtra && (
          <IconButton
            size="small"
            onClick={() => setOpen((p) => !p)}
            sx={{ p: 0 }}
            aria-label={open ? `Hide ${label} details` : `Show ${label} details`}
            aria-expanded={open}
          >
            {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
        )}
      </Stack>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
        {description || "—"}
      </Typography>
      {hasExtra && (
        <Collapse in={open} unmountOnExit>
          {extra}
        </Collapse>
      )}
    </Box>
  );
}

function GrantedFeatsSection({ feats, rulesetId }: GrantedFeatsSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <Box>
      <Stack
        onClick={() => setOpen((prev) => !prev)}
        direction="row"
        sx={{ alignItems: "center", justifyContent: "space-between", cursor: "pointer", mb: 2 }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Granted ({feats.length})
        </Typography>
        <IconButton
          size="small"
          sx={{ p: 0 }}
          aria-label={open ? "Hide granted feats" : "Show granted feats"}
          aria-expanded={open}
        >
          {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Stack>
      <Collapse in={open} unmountOnExit>
        <Stack spacing={3}>
          {feats.map((feat) => {
            const featLink = rulesetId && feat.id ? `/rulesets/${rulesetId}/feats/${feat.id}/customization` : undefined;
            return (
              <Box key={feat.id} sx={{ borderLeft: 4, borderColor: "primary.main", pl: 2 }}>
                <Typography
                  component="h3"
                  sx={{ fontWeight: 600, color: "primary.main", typography: { xs: "body1", sm: "h6" } }}
                >
                  {featLink ? (
                    <MuiLink
                      component={Link}
                      to={featLink}
                      target="_blank"
                      underline="hover"
                      sx={{ color: "primary.main" }}
                    >
                      {feat.name}
                    </MuiLink>
                  ) : (
                    feat.name
                  )}
                </Typography>
                <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
                  {feat.description || "—"}
                </Typography>
              </Box>
            );
          })}
        </Stack>
      </Collapse>
    </Box>
  );
}

export function FeatsSection({ classes, virtualFeats, rulesetId, renderFeatExtra }: FeatsSectionProps) {
  const allFeats = classes
    ? Object.values(classes).flatMap((klass) => (klass.levels || []).flatMap((level) => level.feats || []))
    : [];

  // Group feats by name
  const groupedFeats = allFeats.reduce<Record<string, typeof allFeats>>((acc, feat) => {
    if (!acc[feat.name]) {
      acc[feat.name] = [];
    }
    acc[feat.name].push(feat);
    return acc;
  }, {});

  const renderFeatName = (feat: { id?: string; name: string }, suffix?: string) => {
    const featLink = rulesetId && feat.id ? `/rulesets/${rulesetId}/feats/${feat.id}/customization` : undefined;
    const label = suffix ? `${feat.name} ${suffix}` : feat.name;
    return featLink ? (
      <MuiLink component={Link} to={featLink} target="_blank" underline="hover" sx={{ color: "primary.main" }}>
        {label}
      </MuiLink>
    ) : (
      label
    );
  };

  const featElements = Object.values(groupedFeats).flatMap((featGroup, groupIndex) => {
    const feat = featGroup[0];
    const count = featGroup.length;

    if (feat.stackable && count > 1) {
      return (
        <FeatRow
          key={`${feat.name}-${groupIndex}`}
          name={renderFeatName(feat, `(x${count})`)}
          label={`${feat.name} (x${count})`}
          description={feat.description}
          extra={renderFeatExtra?.(feat)}
        />
      );
    }

    return featGroup.map((featInstance, instanceIndex) => (
      <FeatRow
        key={`${featInstance.name}-${groupIndex}-${instanceIndex}`}
        name={renderFeatName(featInstance)}
        label={featInstance.name}
        description={featInstance.description}
        extra={renderFeatExtra?.(featInstance)}
      />
    ));
  });

  const grantedFeats = virtualFeats ?? [];
  const hasVirtual = grantedFeats.length > 0;

  return (
    <SheetSection title="Feats & Special Abilities">
      {featElements.length > 0 || hasVirtual ? (
        <Stack spacing={3}>
          {featElements}
          {hasVirtual && <GrantedFeatsSection feats={grantedFeats} rulesetId={rulesetId} />}
        </Stack>
      ) : (
        <BlankState title="No feats or special abilities available" />
      )}
    </SheetSection>
  );
}
