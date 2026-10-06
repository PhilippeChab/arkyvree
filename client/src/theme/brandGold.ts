import { alpha } from "@mui/material";

/** The brand gold of the logo and page accents; brighter on the dark theme than `secondary.main`. */
export function brandGold(darkMode: boolean) {
  return darkMode ? "#f5c542" : "#bf9000";
}

/** The brand gold at an opacity, for glows, tints and shadows. */
export function brandGoldTint(darkMode: boolean, opacity: number) {
  return alpha(brandGold(darkMode), opacity);
}
