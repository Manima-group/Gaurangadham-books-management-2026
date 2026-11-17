import type { Role } from "./terms";

export type NavItem = { href: string; label: string; icon: string; mobile?: boolean; group?: string; short?: string; needs?: "availability" };

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
    { href: "/transfers", label: "Dham Transfers", icon: "🚚", group: "Books" },
    { href: "/books", label: "Books & Prices", icon: "📚", group: "Books" },
    { href: "/people", label: "Sevaks & Devotees", icon: "👥", group: "Setup" },
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
    { href: "/transfers", label: "Dham Transfers", icon: "🚚", group: "Books" },
    { href: "/my/sales", label: "My Sales", icon: "🛍️", group: "My own distribution" },
    { href: "/my/books", label: "My Books", icon: "📚", group: "My own distribution" },
    { href: "/my/history", label: "My Sales & History", icon: "🕘", group: "My own distribution" },
    { href: "/my/money", label: "My Money", icon: "💰", group: "My own distribution" },
    { href: "/my/reports", label: "My Reports", icon: "🗂️", group: "My own distribution" },
    { href: "/people", label: "My Devotees & Co-Sevaks", icon: "👥", group: "More" },
    { href: "/activity", label: "Activity History", icon: "🕘", group: "More" },
    { href: "/workflow", label: "How It Works", icon: "🔄", group: "More" },
  ],
  devotee: [
    { href: "/dashboard", label: "Home", icon: "🏠", mobile: true },
    { href: "/my/sales", label: "Today's Sales", short: "Sales", icon: "📝", mobile: true },
    { href: "/my/books", label: "My Books", short: "Books", icon: "📚", mobile: true },
    { href: "/my/money", label: "Submit Money", short: "Money", icon: "💰", mobile: true },
    { href: "/my/reports", label: "My Reports", short: "Reports", icon: "🗂️", mobile: true },
    { href: "/my/history", label: "Sales & History", icon: "🕘" },
    { href: "/availability", label: "Book Availability", icon: "🔎", needs: "availability" },
  ],
};

/** Menu for this person: items needing an access grant show only when a Chakra Sevak gave it. */
export function navFor(u: { role: Role; canSeeAvailability: boolean }): NavItem[] {
  return NAV[u.role].filter((i) => i.needs !== "availability" || u.canSeeAvailability);
}
