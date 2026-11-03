import { HelpLabel, type SectionTab } from "@/client/src/components/common/index.ts";
import { ModifiersIcon, RequirementsIcon } from "@/client/src/components/icons/index.ts";
import type { RulesDescription } from "@/client/src/lib/queries.ts";

/** A tab that customizes an entity: its modifiers or its requirements (its fields are its form's). */
export type CustomizationSection = "modifiers" | "requirements";

/**
 * The tabs that customize an entity, alike on its customization page and as a class page's last tabs, their help its
 * rules' (`rules`: none until they're in).
 */
export function describeCustomizationTabs(rules: RulesDescription | undefined): SectionTab<CustomizationSection>[] {
  return [
    {
      key: "modifiers",
      label: <HelpLabel label="Modifiers" help={rules?.help.modifiers ?? ""} />,
      icon: ModifiersIcon,
    },
    {
      key: "requirements",
      label: <HelpLabel label="Requirements" help={rules?.help.requirements ?? ""} />,
      icon: RequirementsIcon,
    },
  ];
}
