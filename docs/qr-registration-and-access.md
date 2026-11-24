# QR Self-Registration & Access

## Flow
1. **Sector Sevak → People → Registration QR** (`/people/registration`): create a link valid 30/90/180 days. The Dham is fixed on the server (a Sector Sevak can only create for their own Dham; a Chakra Sevak picks one). Token: 192-bit random, URL-safe.
2. **Download QR as PDF** (`/api/register/qr/<id>`): Dham name, Sector, QR, and "Scan this QR to register as a devotee under <Dham>, <Sector>". Only the Sevak of that Dham or a Chakra Sevak can download.
3. **Landing page** `/register/<token>` shows "You are registering under: <Dham> — <Sector>". Expired, revoked or unknown tokens show a clear message.
4. **Sign-up** with name, mobile, password, consent. No SMS/OTP (no paid provider). `email_verified` stays false — an unverified phone is never treated as verified.
5. The person is **logged in at once** to a limited "Awaiting Sector Sevak Approval" screen. They can **collect Outreach Contacts right away** (same form, validation, consent, Dham and audit as everyone) and see only their own contacts. Every other page/action/API redirects or returns 401/403 while pending. Pending registrations may add at most 20 contacts per hour (approved collectors 120); Sevaks are not limited. A rejected registration loses outreach too; a suspended (inactive) account can't sign in.
6. **Review queue** `/people/requests`: search, select one or many, approve (bulk) or do-not-approve (reason required). Possible duplicates (same name in same Dham) are flagged; accounts are never merged. One account per mobile number — a second sign-up with the same number is refused ("log in").
7. **Approval grants nothing.** Two independent permissions, both OFF by default:
   - **Book Distribution** — books, sales, money, transfers, stalls.
   - **Dham Sales View** — read-only totals of own Dham (`/dham-sales`), no devotee names, no sources.
   They can be ticked at approval or toggled later on the devotee list (with an optional reason).
8. **Audit:** `access_audit` stores actor, target, permission, old, new, timestamp, reason for approval decisions and every toggle. Shown on the requests page.
9. Profile/account shows "Book Distribution: Enabled/Disabled" and "Dham Sales View: Enabled/Disabled".

## Rate limiting
`registration_attempt` (hashed IP, invite, time). Max 30 sign-up attempts per network address per hour and 120 per invite per hour (a temple Wi-Fi shares one address). Raise/lower in `src/lib/registration.ts` (`RATE`).

## Who can manage
Sector Sevak: devotees of own Dham. Chakra Sevak: any devotee. Enforced in `canManageAccess()` on the server. Updates are conditional (no lost update if two Sevaks act at once).

## Revoking
"Turn off this QR" sets `revoked_at`; the link stops working immediately. Existing registrations are not affected.

## Three separate permissions (devotees)
| Permission | Who grants | Gives | Requires |
|---|---|---|---|
| **Book Distribution** | Sector Sevak / Chakra Sevak | My Books, sales, Submit Money, transfers, Shared Book Stall; can be assigned books and receive transfers | Approved registration |
| **Book Availability** (unchanged, existing) | Chakra Sevak | See who holds which book in all Dhams and request transfers | Book Distribution **and** the grant |
| **Dham Sales View** | Sector Sevak / Chakra Sevak | Read-only totals of own Dham (`/dham-sales`) — no inventory, no transfers | Approved registration |

Sector Sevaks always have Book Distribution; their Book Availability grant (other Dhams) works as before. Chakra Sevaks have everything.

## Book Distribution OFF — enforced on the server
- Not listed in Assign Books; `assignToDevotee` refuses them (direct requests too).
- Not a transfer receiver: refused at request, approval and dispatch; not listed as a receiver.
- Shared Book Stall: can't create, join, add or confirm books, sell, or be named as the money recipient.
- Pages My Books / Today's Sales / transfers / stalls / availability redirect home; menu items hidden.

## Revoking Book Distribution (reconciliation)
Nothing is deleted. On revoke the app records what the devotee still has (books in hand, money not handed over, open transfers, books on open stalls) in the audit reason and tells the Sevak. The devotee's Home shows "Please hand these back"; they can still **Submit Money** for money already collected, and the Sevak uses **Take Back Books**. Turning it on again restores access.

## Mobile bottom bar
At most 5 icons, chosen from what the person may open (rest stays in ☰ menu):
- Pending devotee: Home · Outreach · Contacts · Profile
- Approved, no Book Distribution: Home · Outreach · Contacts · (Dham Sales) · Profile
- With Book Distribution: Home · Sales · Books · Money · Outreach
- Sevaks / Contact Collection Sevaks: unchanged.
