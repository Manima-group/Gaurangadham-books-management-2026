"""Devotees can collect outreach contacts with the existing form (same rules as a Contact Collection Sevak).
Fresh `npm run db:reset`, production build on :3000."""
import re, subprocess, time
from playwright.sync_api import sync_playwright

B = "http://localhost:3000"
CHROME = "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome"
q = lambda s: subprocess.run(["psql", "-h", "localhost", "-U", "postgres", "-d", "gaurangadham", "-tAc", s], capture_output=True, text=True).stdout.strip()
res = []


def check(name, ok, extra=""):
    res.append((name, ok)); print(("PASS " if ok else "FAIL ") + name + (f"  [{extra}]" if extra and not ok else ""))


def until(sql, want, tries=60):
    for _ in range(tries):
        if q(sql) == want: return True
        time.sleep(0.5)
    return False


def login(b, u, pw, w=390):
    ctx = b.new_context(viewport={"width": w, "height": 844}, is_mobile=w < 800, has_touch=w < 800); ctx.add_init_script("sessionStorage.setItem('gb-intro-seen','1')")
    pg = ctx.new_page(); pg.errs = []; pg.on("pageerror", lambda e: pg.errs.append(str(e)[:150]))
    pg.goto(B + "/login"); pg.fill("#identifier", u); pg.fill("#password", pw); pg.click("button:has-text('Log in')")
    pg.wait_for_url(re.compile("/(dashboard|welcome)"))
    if "/welcome" in pg.url: pg.click("text=Skip the tour"); pg.wait_for_url(re.compile("/dashboard"))
    pg.wait_for_load_state("networkidle")
    return pg


def go(pg, path): pg.goto(B + path); pg.wait_for_load_state("networkidle")


def add(pg, name, mobile, area, interests, consent=True):
    go(pg, "/contacts/new")
    for i in interests: pg.check(f"[data-testid=interest-{i}]")
    pg.fill("[data-testid=c-name]", name); pg.fill("[data-testid=c-mobile]", mobile); pg.fill("[data-testid=c-area]", area)
    if consent: pg.check("[data-testid=c-consent]")
    pg.click("button:has-text('Save contact')")


HYD = int(q("select id from dham where name='Hyderabad Dham'"))
GOV = q("select id from \"user\" where phone='9000000011'"); HARI = q("select id from \"user\" where phone='9000000013'")
LEDGER0 = q("select count(*)||'/'||coalesce(sum(qty),0) from stock_movement") + "|" + q("select count(*)||'/'||coalesce(sum(sales_paise),0) from daily_report") + "|" + q("select count(*) from dham_transfer")
snap = lambda upto: q(f"select coalesce(md5(string_agg(c::text, '|' order by id)),'') from outreach_contact c where id <= {upto}")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)

    # ---------- 11. Contact Collection Sevak still collects (and creates a record that must stay unchanged) ----------
    c = login(b, "9000000031", "contact123")
    add(c, "Existing Visitor", "9876500101", "Ameerpet", ["satsang"])
    check("11 Contact Sevak still collects", until("select count(*) from outreach_contact where full_name='Existing Visitor'", "1"))
    UPTO = q("select coalesce(max(id),0) from outreach_contact"); before = snap(UPTO)

    # ---------- 1–2. Devotee navigation and the same form ----------
    d = login(b, "9000000011", "devotee123")
    check("5 dashboard shows 'Contacts Collected by Me' = 0", d.locator("[data-testid=my-contacts-count]").inner_text().strip() == "0")
    d.click("button[aria-label='Open menu']"); d.wait_for_timeout(400)
    links = set(d.locator("[role=dialog] nav a").evaluate_all("els => els.map(e => e.getAttribute('href'))"))
    check("1 devotee menu has Collect Contacts + My Contacts", {"/contacts/new", "/contacts/mine"} <= links, str(sorted(links)))
    check("1 devotee keeps book menu items", {"/my/sales", "/my/books", "/my/money", "/transfers"} <= links)
    check("1 devotee menu has no admin/manager outreach items", "/contacts" not in links and "/contacts/reports" not in links)
    check("1 menu label is 'Collect Contacts'", d.locator("[role=dialog] nav a[href='/contacts/new']").inner_text().find("Collect Contacts") >= 0)
    d.keyboard.press("Escape")
    go(d, "/contacts/new")
    check("2 devotee opens the existing contact form", d.locator("[data-testid=c-name]").count() == 1 and d.locator("[data-testid=interest-childrens_club]").count() == 1)

    # ---------- 4. Validation unchanged ----------
    n0 = q("select count(*) from outreach_contact")
    add(d, "", "12345", "", [], consent=False)
    d.wait_for_selector("text=Choose at least one activity", timeout=15000)
    check("4 invalid fields refused with existing messages", d.locator("text=valid 10-digit Indian mobile").count() == 1 and d.locator("text=agreed to be contacted").count() >= 1)
    check("4 nothing saved on invalid form", q("select count(*) from outreach_contact") == n0)

    # ---------- 3 + 5. Valid submission, attribution ----------
    add(d, "Devotee Visitor", "+91 98765-00201", "Kukatpally", ["childrens_club", "satsang"])
    d.wait_for_selector("text=Contact saved", timeout=15000)
    check("3 devotee submits a valid contact (existing success message)", until("select count(*) from outreach_contact where full_name='Devotee Visitor'", "1"))
    row = q("select collector_id||'|'||dham_id||'|'||mobile||'|'||consent from outreach_contact where full_name='Devotee Visitor'")
    check("5 attributed to the devotee and their Dham", row == f"{GOV}|{HYD}|9876500201|true", row)
    check("3 interests saved (Children's Club + Satsang)", q("select string_agg(i.interest, ',' order by i.interest) from outreach_contact_interest i join outreach_contact c on c.id=i.contact_id where c.full_name='Devotee Visitor'") == "childrens_club,satsang")
    check("3 audit row written", q("select string_agg(action, ',') from outreach_contact_audit a join outreach_contact c on c.id=a.contact_id where c.full_name='Devotee Visitor'") == "created")

    # ---------- 14. Duplicate handling unchanged ----------
    add(d, "Same Person", "9876500101", "Ameerpet", ["book_reading"])
    d.wait_for_selector("text=may already be on file", timeout=15000)
    check("14 repeated mobile → saved as possible duplicate", q("select dup_status from outreach_contact where full_name='Same Person'") == "possible")
    check("14 other collector's record not disclosed", d.locator("text=Existing Visitor").count() == 0)
    check("14 Sector Sevak notified of the duplicate", until(f"select count(*)>0 from notification n join \"user\" u on u.id=n.user_id where u.phone='9000000002' and n.title='Possible duplicate outreach contact'", "t"))
    go(d, "/contacts/new"); d.check("[data-testid=interest-satsang]")
    d.fill("[data-testid=c-name]", "Double Tap"); d.fill("[data-testid=c-mobile]", "9876500202"); d.fill("[data-testid=c-area]", "Miyapur"); d.check("[data-testid=c-consent]")
    btn = d.locator("button:has-text('Save contact')"); btn.click(); btn.click(force=True, no_wait_after=True)
    d.wait_for_timeout(2500)
    check("14 double tap saves once", q("select count(*) from outreach_contact where mobile='9876500202'") == "1")

    # ---------- own list, count, other users' records ----------
    go(d, "/contacts/mine")
    check("devotee My Contacts lists only own (3)", d.locator("[data-testid=contact-row]").count() == 3)
    go(d, "/dashboard")
    check("5 dashboard count = own records in DB", d.locator("[data-testid=my-contacts-count]").inner_text().strip() == q(f"select count(*) from outreach_contact where collector_id='{GOV}'") == "3")
    other = q("select id from outreach_contact where full_name='Existing Visitor'")
    check("6 devotee can't open another collector's contact (404)", d.goto(B + f"/contacts/{other}").status == 404)
    h = login(b, "9000000013", "devotee123")
    mine = q("select id from outreach_contact where full_name='Devotee Visitor'")
    check("6 another devotee can't open Govinda's contact (404)", h.goto(B + f"/contacts/{mine}").status == 404)
    go(h, "/contacts/mine")
    check("6 another devotee sees none of Govinda's contacts", h.locator("[data-testid=contact-row]").count() == 0)
    go(d, "/contacts")
    check("6 /contacts (full list) redirects devotee to My Contacts", d.url.endswith("/contacts/mine"))

    # ---------- 7–8. No manager/admin/outreach-management operations ----------
    same = q("select id from outreach_contact where full_name='Same Person'")
    go(d, f"/contacts/{same}")
    check("7 no duplicate-review buttons for devotee", d.locator("button:has-text('Not a duplicate')").count() == 0)
    for path in ["/contacts/reports", "/people", "/books", "/stock", "/stock/assign-dham", "/dham", "/activity", "/money", "/closing", "/reports"]:
        go(d, path)
        check(f"8 devotee blocked from {path}", "denied=1" in d.url or d.url.endswith("/login"), d.url.replace(B, ""))
    check("7 devotee can't export contacts (403)", d.request.get(B + "/api/export/contacts?format=xlsx").status == 403)

    # ---------- 9–10. Chakra Sevak and Sector Sevak still collect ----------
    a = login(b, "9000000001", "admin123", 1280)
    add(a, "Admin Visitor", "9876500301", "Begumpet", ["programmes"])
    check("9 Chakra Sevak still collects", until("select count(*) from outreach_contact where full_name='Admin Visitor'", "1"))
    m = login(b, "9000000002", "manager123", 1280)
    add(m, "Manager Visitor", "9876500401", "Secunderabad", ["volunteer"])
    check("10 Sector Sevak still collects", until("select count(*) from outreach_contact where full_name='Manager Visitor'", "1"))

    # ---------- 13. Reports include devotee contacts for the right scope ----------
    go(m, "/contacts?q=Devotee Visitor")
    check("13 Sector Sevak sees the devotee's contact in Outreach Contacts", m.locator("[data-testid=contact-row]").count() == 1)
    go(m, "/contacts/reports")
    check("13 Outreach Reports open for Sector Sevak", m.locator("text=Outreach").count() > 0 and not m.errs)

    # ---------- existing data + books untouched ----------
    check("existing contact records unchanged (byte-identical rows)", snap(UPTO) == before)
    check("12 no stock / sales / transfer rows changed by contact collection", (q("select count(*)||'/'||coalesce(sum(qty),0) from stock_movement") + "|" + q("select count(*)||'/'||coalesce(sum(sales_paise),0) from daily_report") + "|" + q("select count(*) from dham_transfer")) == LEDGER0)
    check("no page errors", not (d.errs or m.errs or a.errs or c.errs or h.errs), str((d.errs + m.errs + a.errs)[:2]))
    b.close()

print(f"\n{sum(o for _, o in res)}/{len(res)} passed")
