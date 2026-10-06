import type { Page } from "@playwright/test";

/** The notification bell, whose name says how many notifications are unread. */
export function notificationBell(page: Page) {
  return page.locator('button[aria-label*=" unread notification"]');
}

/** How many notifications the bell says are unread. */
export async function unreadCount(page: Page) {
  const match = (await notificationBell(page).getAttribute("aria-label"))?.match(/^(\d+) unread notifications?$/);
  return match ? Number(match[1]) : -1;
}
