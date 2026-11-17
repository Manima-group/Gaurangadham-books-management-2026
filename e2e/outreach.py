"""Outreach Contacts + Contact Collection Sevak role. Fresh `npm run db:reset`, app on :3000."""
import re, subprocess, sys, time
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


SOLD0 = q("select count(*)||'/'||coalesce(sum(qty),0) from stock_movement") + "|" + q("select coalesce(sum(sales_paise),0) from daily_report")
HYD = int(q("select id from dham where name='Hyderabad Dham'")); WGL = int(q("select id from dham where name='Warangal Dham'"))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    a = login(b, "9000000001", "admin123", 1280)
    m = login(b, "9000000002", "manager123", 1280)

    # ---------- Account creation by a Sector Sevak (own Dham) and a Chakra Sevak ----------
    go(m, "/people")
    m.select_option("#role", "contact"); m.fill("#pname", "Vrinda Outreach"); m.fill("#phone", "9222222222"); m.fill("#password", "vrinda123")
    m.click("button:has-text('Add Contact Collection Sevak')")
    check("Sector Sevak created a Contact Collection Sevak", until("select role||'/'||dham_id from \"user\" where phone='9222222222'", f"contact/{HYD}"))
    go(a, "/people?role=contact")
    a.select_option("#role", "contact"); a.fill("#pname", "Warangal Outreach"); a.fill("#phone", "9333333333"); a.fill("#password", "wgl12345")
    a.select_option("#dhamId", str(WGL)); a.click("button:has-text('Add Contact Collection Sevak')")
    check("Chakra Sevak created one for Warangal", until("select role||'/'||dham_id from \"user\" where phone='9333333333'", f"contact/{WGL}"))

    # ---------- Sign-in and restricted access ----------
    v = login(b, "9222222222", "vrinda123")
    check("volunteer home shows Add New Contact", v.locator("[data-testid=add-contact]").count() == 1)
    v.click("button[aria-label='Open menu']"); v.wait_for_timeout(400)
    links = sorted(set(v.locator("[role=dialog] nav a").evaluate_all("els => els.map(e => e.getAttribute('href'))")))
    check("volunteer menu has only outreach items", links == ["/account", "/contacts/mine", "/contacts/new", "/dashboard"], str(links))
    v.keyboard.press("Escape")
    blocked = []
    for path in ["/stock", "/transfers", "/transfers/new", "/reports", "/money", "/my/books", "/my/sales", "/people", "/dham", "/availability", "/contacts/reports", "/activity", "/closing"]:
        go(v, path)
        if "denied=1" not in v.url and "/dashboard" not in v.url: blocked.append(path)
    check("volunteer blocked from every book/money/admin page", not blocked, str(blocked))
    r = v.request.get(B + "/api/export/stock?format=pdf")
    check("volunteer blocked from report downloads", r.status == 403)
    r = v.request.get(B + "/api/export/contacts?format=xlsx")
    check("volunteer can't export the contact database", r.status == 403)

    # ---------- Validation, consent, submission, attribution ----------
    add(v, "", "12345", "", [], consent=False)
    v.wait_for_selector("text=Choose at least one activity", timeout=15000)
    check("required fields validated", v.locator("text=valid 10-digit Indian mobile").count() == 1 and v.locator("text=agreed to be contacted").count() >= 1)
    check("nothing saved on invalid form", q("select count(*) from outreach_contact") == "0")
    add(v, "Ramesh Kumar", "+91 98765-43210", "Kukatpally", ["satsang", "gita_class"])
    check("contact saved", until("select count(*) from outreach_contact", "1"))
    row = q(f"select mobile||'|'||consent||'|'||(consent_at is not null)||'|'||dham_id||'|'||(select phone from \"user\" where id=collector_id) from outreach_contact")
    check("mobile normalised, consent + time, Dham + collector recorded", row == f"9876543210|true|true|{HYD}|9222222222", row)
    check("interests saved", q("select string_agg(interest, ',' order by interest) from outreach_contact_interest") == "gita_class,satsang")
    check("audit row without personal data", q("select action from outreach_contact_audit") == "created")
    # Children's Club → guardian wording
    go(v, "/contacts/new"); v.check("[data-testid=interest-childrens_club]")
    check("Children's Club asks for parent / guardian", v.locator("text=Parent / guardian's full name").count() == 1)
    v.fill("[data-testid=c-name]", "Sunita (mother)"); v.fill("[data-testid=c-mobile]", "9123456780"); v.fill("[data-testid=c-area]", "Miyapur"); v.check("[data-testid=c-consent]")
    v.click("button:has-text('Save contact')")
    check("guardian contact saved", until("select count(*) from outreach_contact", "2"))

    # ---------- Double tap saved once ----------
    go(v, "/contacts/new")
    v.check("[data-testid=interest-volunteer]"); v.fill("[data-testid=c-name]", "Double Tap"); v.fill("[data-testid=c-mobile]", "9000012345"); v.fill("[data-testid=c-area]", "Ameerpet"); v.check("[data-testid=c-consent]")
    v.locator("form[novalidate]").evaluate("f => { f.requestSubmit(); f.requestSubmit(); }")
    time.sleep(3)
    check("double submit saved once", q("select count(*) from outreach_contact where mobile='9000012345'") == "1")

    # ---------- Duplicate from another volunteer: warned, not disclosed ----------
    w = login(b, "9333333333", "wgl12345")
    add(w, "R. Kumar", "9876543210", "Hanamkonda", ["book_reading"])
    w.wait_for_selector("text=may already be on file", timeout=15000)
    check("duplicate flagged as possible", q("select dup_status from outreach_contact where full_name='R. Kumar'") == "possible")
    check("other volunteer's record not shown", w.locator("text=Ramesh").count() == 0 and w.locator("text=Kukatpally").count() == 0)

    # ---------- Own-record visibility ----------
    go(w, "/contacts/mine")
    check("volunteer sees only own contacts", w.locator("[data-testid=contact-row]").count() == 1)
    rid = q("select id from outreach_contact where full_name='Ramesh Kumar'")
    r = w.goto(B + f"/contacts/{rid}")
    check("other volunteer's record → 404", r.status == 404)
    go(v, "/contacts/mine?q=ramesh")
    check("own search works", v.locator("[data-testid=contact-row]").count() == 1)

    # ---------- Dashboard counts ----------
    go(v, "/dashboard")
    ic = v.locator("[data-testid=interest-counts]").inner_text()
    check("dashboard totals = 3 own contacts", "3" in v.locator("text=Total collected").locator("xpath=../..").inner_text())
    check("interest counts shown", "Satsang" in ic and "1" in ic)

    # ---------- Manager: own Dham only; Admin: all; reports ----------
    go(m, "/contacts")
    txt = m.locator("[data-testid=contact-list]").inner_text()
    check("Sector Sevak sees own Dham's contacts", "Ramesh Kumar" in txt and "R. Kumar" not in txt)
    did = q("select id from outreach_contact where full_name='R. Kumar'")
    r = m.goto(B + f"/contacts/{did}")
    check("Sector Sevak can't open another Dham's contact", r.status == 404)
    go(a, "/contacts?dup=possible")
    check("Chakra Sevak sees duplicates to review", a.locator("[data-testid=contact-row]", has_text="R. Kumar").count() == 1)
    go(a, f"/contacts/{did}"); a.click("button:has-text('Not a duplicate')")
    check("duplicate reviewed", until(f"select dup_status from outreach_contact where id={did}", "not_duplicate"))
    go(a, "/contacts/reports")
    check("admin reports: totals", "4" in a.locator("text=Total contacts").locator("xpath=../..").inner_text())
    check("admin reports: unique numbers", "3" in a.locator("text=Unique contacts").locator("xpath=../..").inner_text())
    go(m, "/contacts/reports")
    check("manager reports scoped to own Dham", "3" in m.locator("text=Total contacts").locator("xpath=../..").inner_text())
    r = m.request.get(B + "/api/export/contacts?format=xlsx")
    check("manager can export own Dham contacts", r.status == 200 and "spreadsheetml" in r.headers["content-type"])
    check("export logged", q("select count(*) from activity_log where action like '%downloaded%outreach contacts%'") == "1")

    # ---------- Correction and deletion ----------
    go(v, f"/contacts/{rid}")
    v.fill("[data-testid=c-area]", "Kukatpally Housing Board"); v.click("button:has-text('Save changes')")
    check("collector corrected own record", until(f"select area from outreach_contact where id={rid}", "Kukatpally Housing Board"))
    go(m, f"/contacts/{rid}"); m.click("button:has-text('Delete contact')"); m.click("button:has-text('Yes, delete')")
    check("Sector Sevak deleted a record", until(f"select count(*) from outreach_contact where id={rid}", "0"))
    check("deletion audited", q(f"select string_agg(action, ',' order by id) from outreach_contact_audit where contact_id={rid}") == "created,edited,deleted")
    check("contacts don't touch books or sales", q("select count(*)||'/'||coalesce(sum(qty),0) from stock_movement") + "|" + q("select coalesce(sum(sales_paise),0) from daily_report") == SOLD0)

    errs = a.errs + m.errs + v.errs + w.errs
    check("no page errors", not errs, "; ".join(errs[:3]))
    b.close()

bad = [n for n, ok in res if not ok]
print(f"\n{len(res) - len(bad)}/{len(res)} passed")
sys.exit(1 if bad else 0)
