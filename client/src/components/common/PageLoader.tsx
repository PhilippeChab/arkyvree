import { DiceSpinner } from "./DiceSpinner.tsx";

/**
 * A page's first load: the spinner where its content goes, the same size and spacing on every page. A page whose shape
 * is known draws a skeleton of it instead (the character sheet).
 */
export function PageLoader() {
  return <DiceSpinner sx={{ py: { xs: 4, sm: 8 } }} />;
}
