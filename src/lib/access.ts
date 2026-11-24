/**
 * Who may hold / receive / sell books. Pure (no database) so pages, actions and tests share one rule.
 * Sector Sevaks always may; a devotee only when approved, active and Book Distribution is on.
 */
export function mayHoldBooks(p: { role: string; isActive?: boolean | null; approvalStatus?: string | null; canDistributeBooks?: boolean | null }) {
  if (p.isActive === false) return false;
  if (p.approvalStatus && p.approvalStatus !== "approved") return false;
  if (p.role === "manager") return true;
  return p.role === "devotee" && !!p.canDistributeBooks;
}

/** Contacts a not-yet-approved devotee may add per hour; others. Keeps a fresh self-registration from being used for spam. */
export const CONTACT_RATE = { pendingPerHour: 20, perHour: 120 };
