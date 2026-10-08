import { Box, Collapse, Link as MuiLink, Stack, Typography } from "@mui/material";
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";

import {
  BlankNote,
  EmptyValue,
  EntryTitle,
  SubsectionTitle,
  ToggleLabel,
} from "@/client/src/components/common/index.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";
import { buildCustomizationPath } from "@/shared/customization/entities.ts";

import { SheetSection } from "./SheetSection.tsx";

type Feat = CharacterDetail["classes"][string]["levels"][number]["feats"][number];

interface FeatRowProps {
  /** Its heading's level: `h4` under the Granted heading. */
  component?: "h3" | "h4";
  extra?: ReactNode;
  feat: Pick<Feat, "description" | "id" | "name">;
  rulesetId?: string;
  /** Said after its name: a stackable feat's count, "(x2)". */
  suffix?: string;
}

interface FeatsSectionProps {
  classes: CharacterDetail["classes"];
  renderFeatExtra?: (feat: Feat) => ReactNode;
  rulesetId?: string;
  virtualFeats?: CharacterDetail["virtualFeats"];
}

interface GrantedFeatsSectionProps {
  feats: NonNullable<FeatsSectionProps["virtualFeats"]>;
  rulesetId?: string;
}

/** A feat on the sheet: its name, a link to its page in the ruleset, over its description, and its details to open. */
function FeatRow({ feat, suffix, rulesetId, extra, component }: FeatRowProps) {
  const [open, setOpen] = useState(false);
  const hasExtra = extra != null && extra !== false;
  const label = suffix ? `${feat.name} ${suffix}` : feat.name;
  const name =
    rulesetId && feat.id ? (
      <MuiLink
        component={Link}
        to={`/rulesets/${rulesetId}/${buildCustomizationPath("feats", feat.id)}`}
        target="_blank"
        underline="hover"
        sx={{ color: "primary.main" }}
      >
        {label}
      </MuiLink>
    ) : (
      label
    );

  return (
    // Without details, the bar runs a little past the description
    <Stack spacing={1} sx={{ borderLeft: 4, borderColor: "primary.main", pl: 2, pb: hasExtra ? 0 : 1 }}>
      <Box>
        <EntryTitle component={component}>
          {hasExtra ? (
            <ToggleLabel open={open} onToggle={() => setOpen((p) => !p)} label={`${label} Details`}>
              {name}
            </ToggleLabel>
          ) : (
            name
          )}
        </EntryTitle>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {feat.description || <EmptyValue />}
        </Typography>
      </Box>
      {hasExtra && (
        // Mounted while closed: the space above it stays, as the details open and close within it
        <Collapse in={open} timeout="auto">
          <Box sx={{ pt: 1.5 }}>{extra}</Box>
        </Collapse>
      )}
    </Stack>
  );
}

function GrantedFeatsSection({ feats, rulesetId }: GrantedFeatsSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <Stack spacing={1}>
      <SubsectionTitle>
        <ToggleLabel open={open} onToggle={() => setOpen((prev) => !prev)}>
          Granted ({feats.length})
        </ToggleLabel>
      </SubsectionTitle>
      {/* Mounted while closed: the space above it stays, as the list opens and closes within it */}
      <Collapse in={open} timeout="auto">
        <Stack spacing={3}>
          {feats.map((feat) => (
            <FeatRow key={feat.id} feat={feat} rulesetId={rulesetId} component="h4" />
          ))}
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
    if (!acc[feat.name]) acc[feat.name] = [];

    acc[feat.name].push(feat);
    return acc;
  }, {});

  const featElements = Object.values(groupedFeats).flatMap((featGroup, groupIndex) => {
    const feat = featGroup[0];
    const count = featGroup.length;

    if (feat.stackable && count > 1) {
      return (
        <FeatRow
          key={`${feat.name}-${groupIndex}`}
          feat={feat}
          suffix={`(x${count})`}
          rulesetId={rulesetId}
          extra={renderFeatExtra?.(feat)}
        />
      );
    }

    return featGroup.map((featInstance, instanceIndex) => (
      <FeatRow
        key={`${featInstance.name}-${groupIndex}-${instanceIndex}`}
        feat={featInstance}
        rulesetId={rulesetId}
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
        <BlankNote>No feats or special abilities available</BlankNote>
      )}
    </SheetSection>
  );
}
