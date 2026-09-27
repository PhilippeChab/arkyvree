import { alpha } from "@mui/material/styles";

/** The brand gold of the logo and page accents; brighter on the dark theme than `secondary.main`. */
export const brandGold = (darkMode: boolean) => (darkMode ? "#f5c542" : "#bf9000");

/** The brand gold at an opacity, for glows, tints and shadows. */
export const brandGoldTint = (darkMode: boolean, opacity: number) => alpha(brandGold(darkMode), opacity);
