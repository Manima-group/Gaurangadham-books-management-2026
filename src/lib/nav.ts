import type { Role } from "./terms";

export type NavItem = { href: string; label: string; icon: string; mobile?: boolean; group?: string; short?: string; needs?: "availability" | "distribute" | "dhamSales"; /** open to a devotee whose registration is still pending */ outreach?: boolean };

/**
 * Menu items, grouped into short sections so each menu shows a few clear headings.
 * Same destinations and the same per-role access as before — only the order and grouping.
 */
export const NAV: Record<Role, NavItem[]> = {
  admin: [
    { href: "/dashboard", label: "Home", icon: "🏠", mobile: true },
    { href: "/dham", label: "Dhams & Devotees", short: "Dhams", icon: "🛕", mobile: true },
    { href: "/reports", label: "Daily Reports", short: "Reports", icon: "📝", mobile: true, group: "Daily work" },
    { href: "/money", label: "Collected Money", short: "Money", icon: "💰", mobile: true, group: "Daily work" },
    { href: "/closing", label: "Daily Closing", icon: "🔒", group: "Daily work" },
    { href: "/monitor", label: "All Dhams Overview", icon: "📊", group: "Daily work" },
    { href: "/distribution", label: "Dham-wise Distribution", icon: "🏆", group: "Daily work" },
    { href: "/stock", label: "Book Stock", short: "Stock", icon: "📦", group: "Books" },
    { href: "/availability", label: "Book Availability", icon: "🔎", group: "Books" },
    { href: "/transfers", label: "Books Transfer", icon: "🚚", group: "Books" },
    { href: "/books", label: "Books & Prices", icon: "📚", group: "Books" },
    { href: "/stalls", label: "Shared Book Stall", icon: "🎪", group: "Books" },
    { href: "/stock/sources", label: "Stock Sources", icon: "🏷️", group: "Books" },
    { href: "/contacts", label: "Outreach Contacts", icon: "📇", group: "Outreach" },
    { href: "/contacts/reports", label: "Outreach Reports", icon: "📈", group: "Outreach" },
    { href: "/people", label: "Sevaks & Devotees", icon: "👥", group: "Setup" },
    { href: "/people/requests", label: "Registration Requests", icon: "📝", group: "Setup" },
    { href: "/dhams", label: "Manage Dhams", icon: "🗺️", group: "Setup" },
    { href: "/drives", label: "Distribution Drives", icon: "🚩", group: "Setup" },
    { href: "/setup", label: "Setup Progress", icon: "✅", group: "Setup" },
    { href: "/activity", label: "Activity History", icon: "🕘", group: "Setup" },
    { href: "/workflow", label: "How It Works", icon: "🔄", group: "Setup" },
  ],
  manager: [
    { href: "/dashboard", label: "Home", icon: "🏠", mobile: true },
    { href: "/dham", label: "My Dham & Devotees", short: "Devotees", icon: "🛕", mobile: true },
    { href: "/reports", label: "Daily Reports", short: "Reports", icon: "📝", mobile: true, group: "Daily work" },
    { href: "/pending", label: "Pending Submissions", icon: "⏳", group: "Daily work" },
    { href: "/money", label: "Collected Money", short: "Money", icon: "💰", mobile: true, group: "Daily work" },
    { href: "/closing", label: "Daily Closing", icon: "🔒", group: "Daily work" },
    { href: "/distribution", label: "Who Distributed", icon: "🏆", group: "Daily work" },
    { href: "/stock", label: "Book Stock", short: "Stock", icon: "📦", group: "Books" },
    { href: "/stock/assign-devotees", label: "Assign Books", icon: "🤲", group: "Books" },
    { href: "/availability", label: "Book Availability", icon: "🔎", group: "Books" },
    { href: "/transfers", label: "Books Transfer", icon: "🚚", group: "Books" },
    { href: "/stalls", label: "Shared Book Stall", icon: "🎪", group: "Books" },
    { href: "/stock/sources", label: "Stock Sources", icon: "🏷️", group: "Books" },
    { href: "/contacts", label: "Outreach Contacts", icon: "📇", group: "Outreach" },
    { href: "/contacts/reports", label: "Outreach Reports", icon: "📈", group: "Outreach" },
    { href: "/my/sales", label: "My Sales", icon: "🛍️", group: "My own distribution" },
    { href: "/my/books", label: "My Books", icon: "📚", group: "My own distribution" },
    { href: "/my/history", label: "My Sales & History", icon: "🕘", group: "My own distribution" },
    { href: "/my/money", label: "My Money", icon: "💰", group: "My own distribution" },
    { href: "/my/reports", label: "My Reports", icon: "🗂️", group: "My own distribution" },
    { href: "/people", label: "My Devotees & Co-Sevaks", icon: "👥", group: "More" },
    { href: "/people/requests", label: "Registration Requests", icon: "📝", group: "More" },
    { href: "/activity", label: "Activity History", icon: "🕘", group: "More" },
    { href: "/workflow", label: "How It Works", icon: "🔄", group: "More" },
  ],
  devotee: [
    { href: "/dashboard", label: "Home", icon: "🏠", mobile: true },
    { href: "/my/sales", label: "Today's Sales", short: "Sales", icon: "📝", mobile: true, needs: "distribute" },
    { href: "/my/books", label: "My Books", short: "Books", icon: "📚", mobile: true, needs: "distribute" },
    { href: "/my/money", label: "Submit Money", short: "Money", icon: "💰", mobile: true, needs: "distribute" },
    { href: "/my/reports", label: "My Reports", short: "Reports", icon: "🗂️", mobile: true, needs: "distribute" },
    { href: "/my/history", label: "Sales & History", icon: "🕘", needs: "distribute" },
    { href: "/stalls", label: "Shared Book Stall", icon: "🎪", needs: "distribute" },
    { href: "/transfers", label: "Books Transfer", icon: "🚚", needs: "distribute" },
    { href: "/availability", label: "Book Availability", icon: "🔎", needs: "availability" },
    { href: "/dham-sales", label: "Dham Sales", icon: "📊", needs: "dhamSales" },
    { href: "/contacts/new", label: "Collect Contacts", short: "Outreach", icon: "➕", group: "Outreach", outreach: true },
    { href: "/contacts/mine", label: "My Contacts", short: "Contacts", icon: "📇", group: "Outreach", outreach: true },
  ],
  // Contact Collection Sevak: outreach only — nothing about books, stock or money.
  contact: [
    { href: "/dashboard", label: "Dashboard", icon: "🏠", mobile: true },
    { href: "/contacts/new", label: "Add Contact", short: "Add", icon: "➕", mobile: true },
    { href: "/contacts/mine", label: "My Contacts", icon: "📇", mobile: true },
    { href: "/account", label: "Profile", icon: "👤", mobile: true },
  ],
};

/** Menu for this person: items needing an access grant show only when a Chakra Sevak gave it. */
export function navFor(u: { role: Role; canSeeAvailability: boolean; approvalStatus: string; canDistribute: boolean; canViewDhamSales: boolean }): NavItem[] {
  // Awaiting approval: Home and outreach (contact collection) only. Rejected: Home only.
  // The account link is always in the menu footer.
  if (u.approvalStatus !== "approved")
    return NAV[u.role].filter((i) => i.href === "/dashboard" || (u.approvalStatus === "pending" && u.role === "devotee" && i.outreach));
  return NAV[u.role].filter(
    (i) =>
      (i.needs !== "availability" || u.canSeeAvailability) &&
      (i.needs !== "distribute" || u.canDistribute) &&
      (i.needs !== "dhamSales" || u.canViewDhamSales),
  );
}

const PROFILE: NavItem = { href: "/account", label: "Profile", icon: "👤", mobile: true };

/**
 * Mobile bottom bar — at most 5 icons, most-used first, from what this person may open.
 * Devotees: pending → Home, Outreach, Contacts, Profile. With Book Distribution → Home, Sales, Books, Money,
 * then Outreach. Without it → Home, Outreach, Contacts, Dham Sales (if given), Profile. Everything else stays in the ☰ menu.
 */
export function bottomNavFor(u: Parameters<typeof navFor>[0]): NavItem[] {
  const items = navFor(u);
  if (u.role !== "devotee") return items.filter((i) => i.mobile).slice(0, 5);
  const by = (href: string) => items.find((i) => i.href === href);
  const order = u.approvalStatus === "approved" && u.canDistribute
    ? ["/dashboard", "/my/sales", "/my/books", "/my/money", "/contacts/new"]
    : ["/dashboard", "/contacts/new", "/contacts/mine", "/dham-sales"];
  const list = order.map(by).filter((i): i is NavItem => !!i);
  if (!(u.approvalStatus === "approved" && u.canDistribute)) list.push(PROFILE);
  return list.slice(0, 5).map((i) => ({ ...i, mobile: true }));
}
