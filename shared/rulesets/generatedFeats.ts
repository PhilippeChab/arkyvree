/** Stable dependency identity; labels may change independently of a feat's name. */
export interface GeneratedFeatSource {
  kind: string;
  key: string;
  label: string;
}

export interface GeneratedFeatIdentity extends GeneratedFeatSource {
  family: string;
}
