import {
  AccessibilityNew,
  Bolt,
  Category,
  Construction,
  Face,
  FitnessCenter,
  Gavel,
  Psychology,
  Shield,
  Spoke,
  Stars,
  type SvgIconComponent,
  Translate,
} from "@mui/icons-material";

/** The pictures an entity kind's tab shows, by the generic name its rules give it (`face`, `bolt`). */
const KIND_ICONS: Readonly<Record<string, SvgIconComponent>> = {
  accessibility: AccessibilityNew,
  bolt: Bolt,
  construction: Construction,
  face: Face,
  fitness: FitnessCenter,
  gavel: Gavel,
  psychology: Psychology,
  shield: Shield,
  spoke: Spoke,
  stars: Stars,
  translate: Translate,
};

/** The picture an entity kind's rules name (`icon`), else a generic one. */
export function kindIcon(icon: string): SvgIconComponent {
  return KIND_ICONS[icon] ?? Category;
}
