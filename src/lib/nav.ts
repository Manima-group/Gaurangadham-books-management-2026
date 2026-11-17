import type { Role } from "./terms";

export type NavItem = { href: string; label: string; icon: string; mobile?: boolean; group?: string; short?: string; needs?: "availability" };

export const NAV: Record<Role, NavItem[]> = {
  admin: [
    { href: "/dashboard", label: "Home", icon: "🏠", mobile: true },
    { href: "/dham", label: "Dhams & Devotees", short: "Dhams", icon: "🛕", mobile: true },
    { href: "/distribution", label: "Dham-wise Distribution", icon: "🏆" },
    { href: "/setup", label: "Setup Progress", icon: "✅" },
    { href: "/stock", label: "Book Stock", short: "Stock", icon: "📦" },
    { href: "/availability", label: "Book Availability", icon: "🔎" },
    { href: "/transfers", label: "Dham Transfers", icon: "🚚" },
    { href: "/reports", label: "Daily Reports", short: "Reports", icon: "📝", mobile: true },
    { href: "/money", label: "Collected Money", short: "Money", icon: "💰", mobile: true },
    { href: "/monitor", label: "All Dhams Overview", icon: "📊" },
    { href: "/closing", label: "Daily Closing", icon: "🔒" },
    { href: "/workflow", label: "How It Works", icon: "🔄" },
    { href: "/dhams", label: "Dhams", icon: "🗺️", group: "Settings" },
    { href: "/books", label: "Books & Prices", icon: "📚", group: "Settings" },
    { href: "/people", label: "Sevaks & Devotees", icon: "👥", group: "Settings" },
    { href: "/drives", label: "Distribution Drives", icon: "🚩", group: "Settings" },
    { href: "/activity", label: "Activity History", icon: "🕘", group: "Settings" },
  ],
  manager: [
    { href: "/dashboard", label: "Home", icon: "🏠", mobile: true },
    { href: "/dham", label: "My Dham & Devotees", short: "Devotees", icon: "🛕", mobile: true },
    { href: "/stock", label: "Book Stock", short: "Stock", icon: "📦" },
    { href: "/stock/assign-devotees", label: "Assign Books", icon: "🤲" },
    { href: "/availability", label: "Book Availability", icon: "🔎" },
    { href: "/transfers", label: "Dham Transfers", icon: "🚚" },
    { href: "/distribution", label: "Who Distributed", icon: "🏆" },
    { href: "/reports", label: "Daily Reports", short: "Reports", icon: "📝", mobile: true },
    { href: "/pending", label: "Pending Submissions", icon: "⏳" },
    { href: "/money", label: "Collected Money", short: "Money", icon: "💰", mobile: true },
    { href: "/closing", label: "Daily Closing", icon: "🔒" },
    { href: "/workflow", label: "How It Works", icon: "🔄" },
    { href: "/my/sales", label: "My Sales", icon: "🛍️", group: "My own distribution" },
    { href: "/my/books", label: "My Books", icon: "📚", group: "My own distribution" },
    { href: "/my/history", label: "My Sales & History", icon: "🕘", group: "My own distribution" },
    { href: "/my/money", label: "My Money", icon: "💰", group: "My own distribution" },
    { href: "/my/reports", label: "My Reports", icon: "🗂️", group: "My own distribution" },
    { href: "/people", label: "My Devotees & Co-Sevaks", icon: "👥", group: "More" },
    { href: "/activity", label: "Activity History", icon: "🕘", group: "More" },
  ],
  devotee: [
    { href: "/dashboard", label: "Home", icon: "🏠", mobile: true },
    { href: "/my/sales", label: "Today's Sales", short: "Sales", icon: "📝", mobile: true },
    { href: "/my/books", label: "My Books", short: "Books", icon: "📚", mobile: true },
    { href: "/my/history", label: "Sales & History", icon: "🕘" },
    { href: "/my/money", label: "Submit Money", short: "Money", icon: "💰", mobile: true },
    { href: "/my/reports", label: "My Reports", short: "Reports", icon: "🗂️", mobile: true },
    { href: "/availability", label: "Book Availability", icon: "🔎", needs: "availability" },
  ],
};

/** Menu for this person: items needing an access grant show only when a Chakra Sevak gave it. */
export function navFor(u: { role: Role; canSeeAvailability: boolean }): NavItem[] {
  return NAV[u.role].filter((i) => i.needs !== "availability" || u.canSeeAvailability);
}
