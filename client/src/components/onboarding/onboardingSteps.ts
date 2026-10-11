import {
  CampaignIcon,
  CharacterIcon,
  HelpIcon,
  RulesetIcon,
  type SvgIconComponent,
} from "@/client/src/components/icons/index.ts";
import type { SidebarId } from "@/client/src/components/layout/index.ts";
import { APP_NAME, TAGLINE, TAGLINE_DETAIL } from "@/client/src/lib/brand.ts";

/** A step of the tour: a dialog's, or one shown beside the sidebar's item it names (`sidebarId`). */
interface OnboardingStep {
  description: string;
  /** What it says more of, under its description: a `HelpLabel`'s label and its tooltip's text. */
  help?: { label: string; text: string };
  icon: SvgIconComponent | null;
  logo?: boolean;
  /** The sidebar's item the step points at, beside it, on a wide screen: a dialog's step has none. */
  sidebarId?: SidebarId;
  title: string;
}

/** The tour's steps, in order; `{help}` in a description is the link to Help. */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    icon: null,
    logo: true,
    title: `Welcome to ${APP_NAME}`,
    description: `${TAGLINE}. ${TAGLINE_DETAIL}`,
  },
  {
    icon: RulesetIcon,
    title: "Rulesets",
    description:
      "The foundation — browse base and community rulesets, fork a base ruleset to create your own, and customize rules to fit your table.",
    help: {
      label: "Forking & Extensions",
      text: "Forking creates your own editable copy of a base ruleset — it inherits all entities and only copies what you change. Extensions let you subscribe to sourcebook content packages that add new feats, items, classes, and more.",
    },
    sidebarId: "rulesets",
  },
  {
    icon: CharacterIcon,
    title: "Characters",
    description: "Create characters using any ruleset — build sheets with stats, feats, equipment, and more.",
    sidebarId: "characters",
  },
  {
    icon: CampaignIcon,
    title: "Campaigns",
    description: "Organize your games — create campaigns, invite players, and manage characters together.",
    sidebarId: "campaigns",
  },
  {
    icon: HelpIcon,
    title: "Learn More",
    description: "Want to dive deeper? {help} covers rulesets, forking, the customization system, and more.",
  },
];
