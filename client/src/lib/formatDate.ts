/** The client's dates, in the viewer's language: a date, a date and its time, and how long ago. */

/** A date on its own ("9/27/2026"), in the viewer's locale. */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString();
}

/** A date and its time ("Oct 6, 2026, 7:44 PM"), in the viewer's language. */
export function formatDateTime(dateString: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

/** How long ago a date was ("5m ago", "3d ago"), its date and time past a month. */
export function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diff = now - then;

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateTime(dateString);
}
