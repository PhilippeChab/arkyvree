import { Box, Collapse, Link as MuiLink, Stack, Typography } from "@mui/material";
import { useState } from "react";
import { Link } from "react-router-dom";

import { BlankState, CLICKABLE_SX, ExpandArrow, toggleProps } from "@/client/src/components/common/index.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";

import { SheetSection } from "./SheetSection.tsx";

type Feat = CharacterDetail["classes"][string]["levels"][number]["feats"][number];

interface FeatRowProps {
  name: React.ReactNode;
  description?: string | null;
  extra?: React.ReactNode;
}

interface FeatsSectionProps {
  classes: CharacterDetail["classes"];
  virtualFeats?: CharacterDetail["virtualFeats"];
  rulesetId?: string;
  renderFeatExtra?: (feat: Feat) => React.ReactNode;
}

interface GrantedFeatsSectionProps {
  feats: NonNullable<FeatsSectionProps["virtualFeats"]>;
  rulesetId?: string;
}

function FeatRow({ name, description, extra }: FeatRowProps) {
  const [open, setOpen] = useState(false);
  const hasExtra = extra != null && extra !== false;

  return (
    <Stack spacing={1} sx={{ borderLeft: 4, borderColor: "primary.main", pl: 2 }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", justifyContent: "space-between", ...(hasExtra && CLICKABLE_SX) }}
        {...(hasExtra && toggleProps(open, () => setOpen((p) => !p)))}
      >
        <Typography
          component="h3"
          sx={{ fontWeight: 600, color: "primary.main", typography: { xs: "body1", sm: "h6" } }}
        >
          {name}
        </Typography>
        {hasExtra && <ExpandArrow open={open} />}
      </Stack>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        {description || "—"}
      </Typography>
      {hasExtra && (
        <Collapse in={open} unmountOnExit>
          {extra}
        </Collapse>
      )}
    </Stack>
  );
}

function GrantedFeatsSection({ feats, rulesetId }: GrantedFeatsSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <Stack spacing={2}>
      <Stack
        {...toggleProps(open, () => setOpen((prev) => !prev))}
        direction="row"
        sx={{ alignItems: "center", justifyContent: "space-between", ...CLICKABLE_SX }}
      >
        <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 600 }}>
          Granted ({feats.length})
        </Typography>
        <ExpandArrow open={open} />
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
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  {feat.description || "—"}
                </Typography>
              </Box>
            );
          })}
        </Stack>
      </Collapse>
    </Stack>
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
          description={feat.description}
          extra={renderFeatExtra?.(feat)}
        />
      );
    }

    return featGroup.map((featInstance, instanceIndex) => (
      <FeatRow
        key={`${featInstance.name}-${groupIndex}-${instanceIndex}`}
        name={renderFeatName(featInstance)}
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
