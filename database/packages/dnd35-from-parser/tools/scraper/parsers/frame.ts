// The frame dndtools.net pages share: the site's tagline and navigation.

const SITE_FRAME = ["Feats", "D&D", "Welcome", "Home", "About", "Search", "Login"];

/** Matches the headings of the site's frame (its tagline, its navigation) and those starting with one of `extra`. */
export function frameHeading(...extra: string[]): RegExp {
  return new RegExp(`^(${[...SITE_FRAME, ...extra].map(RegExp.escape).join("|")})`, "i");
}
