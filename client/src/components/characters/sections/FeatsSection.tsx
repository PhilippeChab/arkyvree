import { Box, Link as MuiLink, Stack, Typography } from "@mui/material";
import { useState } from "react";
import { Link } from "react-router-dom";

import { BlankState, Section, Subsection } from "@/client/src/components/common/index.ts";
import type { CharacterDetail } from "@/client/src/lib/queries.ts";

type Feat = CharacterDetail["classes"][string]["levels"][number]["feats"][number];

interface FeatRowProps {
  name: React.ReactNode;
  description?: string | null;
  /** What opens under the feat (a familiar's sheet) */
  extra?: React.ReactNode;
  /** `h4` for a feat within a group (the granted ones) */
  level?: "h3" | "h4";
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

/** A feat's name, a link to its page when the ruleset is known; a stacked feat's count after it (`(x2)`). */
function featName(feat: { id?: string; name: string }, rulesetId?: string, suffix?: string) {
  const featLink = rulesetId && feat.id ? `/rulesets/${rulesetId}/feats/${feat.id}/customization` : undefined;
  const label = suffix ? `${feat.name} ${suffix}` : feat.name;
  return featLink ? (
    <MuiLink component={Link} to={featLink} target="_blank" underline="hover" sx={{ color: "primary.main" }}>
      {label}
    </MuiLink>
  ) : (
    label
  );
}

function FeatRow({ name, description, extra, level = "h3" }: FeatRowProps) {
  const [open, setOpen] = useState(false);
  const hasExtra = extra != null && extra !== false;
  const summary = (
    <Typography variant="body2" sx={{ color: "text.secondary" }}>
      {description || "—"}
    </Typography>
  );

  return (
    <Box sx={{ borderLeft: 4, borderColor: "primary.main", pl: 2 }}>
      <Subsection
        title={name}
        level={level}
        summary={summary}
        {...(hasExtra && { open, onToggle: () => setOpen((prev) => !prev) })}
      >
        {hasExtra && extra}
      </Subsection>
    </Box>
  );
}

function GrantedFeatsSection({ feats, rulesetId }: GrantedFeatsSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <Subsection title={`Granted (${feats.length})`} open={open} onToggle={() => setOpen((prev) => !prev)}>
      <Stack spacing={3}>
        {feats.map((feat) => {
          return <FeatRow key={feat.id} name={featName(feat, rulesetId)} description={feat.description} level="h4" />;
        })}
      </Stack>
    </Subsection>
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

  const featElements = Object.values(groupedFeats).flatMap((featGroup, groupIndex) => {
    const feat = featGroup[0];
    const count = featGroup.length;

    if (feat.stackable && count > 1) {
      return (
        <FeatRow
          key={`${feat.name}-${groupIndex}`}
          name={featName(feat, rulesetId, `(x${count})`)}
          description={feat.description}
          extra={renderFeatExtra?.(feat)}
        />
      );
    }

    return featGroup.map((featInstance, instanceIndex) => (
      <FeatRow
        key={`${featInstance.name}-${groupIndex}-${instanceIndex}`}
        name={featName(featInstance, rulesetId)}
        description={featInstance.description}
        extra={renderFeatExtra?.(featInstance)}
      />
    ));
  });

  const grantedFeats = virtualFeats ?? [];
  const hasVirtual = grantedFeats.length > 0;

  return (
    <Section title="Feats & Special Abilities">
      {featElements.length > 0 || hasVirtual ? (
        <Stack spacing={3}>
          {featElements}
          {hasVirtual && <GrantedFeatsSection feats={grantedFeats} rulesetId={rulesetId} />}
        </Stack>
      ) : (
        <BlankState title="No feats or special abilities available" />
      )}
    </Section>
  );
}
