/** Dates as the app shows them, in the viewer's locale: a day ("Sep 27, 2026"), a moment, or how long ago. */

/** A day, read the same way everywhere. */
const DAY: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };

/** A moment: its day and its time. */
const MOMENT: Intl.DateTimeFormatOptions = { ...DAY, hour: "numeric", minute: "2-digit" };

/** A day: "Sep 27, 2026" (an invite's, a player's, a modifier's). */
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat(undefined, DAY).format(new Date(date));
}

/** A moment: "Sep 27, 2026, 3:04 PM" (an activity's). */
export function formatDateTime(date: string): string {
  return new Intl.DateTimeFormat(undefined, MOMENT).format(new Date(date));
}

/** How long ago, in the unit that reads best ("5m ago"), and the moment once it's a month old (a notification's). */
export function formatRelativeTime(date: string): string {
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateTime(date);
}
