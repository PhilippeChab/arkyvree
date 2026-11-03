/**
 * What takes a deleted account's address (`userId`), on its row and on the invites and contributions that named it, so
 * the address is free at once. It holds no `@`: the email rule refuses it, so nobody can register it ahead of a deletion
 * (a user's id isn't a secret), no mail goes to it, and it can't pass for a demo's address.
 */
export function toDeletedAddress(userId: string) {
  return `deleted:${userId}`;
}
