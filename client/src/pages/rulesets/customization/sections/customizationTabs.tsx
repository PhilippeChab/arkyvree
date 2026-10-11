import { HelpLabel, type SectionTab } from "@/client/src/components/common/index.ts";
import { MODIFIERS_HELP, PROPERTIES_HELP, REQUIREMENTS_HELP } from "@/client/src/components/customization/index.ts";
import { ModifiersIcon, PropertiesIcon, RequirementsIcon } from "@/client/src/components/icons/index.ts";

/** A tab that customizes an entity: its properties, its modifiers or its requirements. */
export type CustomizationSection = "properties" | "modifiers" | "requirements";

/** The tabs that customize an entity, alike on its customization page and as a class page's last tabs. */
export const CUSTOMIZATION_TABS: SectionTab<CustomizationSection>[] = [
  { key: "properties", label: <HelpLabel label="Properties" help={PROPERTIES_HELP} />, icon: PropertiesIcon },
  { key: "modifiers", label: <HelpLabel label="Modifiers" help={MODIFIERS_HELP} />, icon: ModifiersIcon },
  { key: "requirements", label: <HelpLabel label="Requirements" help={REQUIREMENTS_HELP} />, icon: RequirementsIcon },
];
