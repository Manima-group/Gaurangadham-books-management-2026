"""Dham → Devotee → Books / Sales / History: navigation, data accuracy, access rules.
Run against a fresh `npm run db:reset` with the app on :3000 (PGPASSWORD set for psql)."""
import re, subprocess
from playwright.sync_api import sync_playwright, expect

B = "http://localhost:3000"
IST = "(now() at time zone 'Asia/Kolkata')::date"


def q(s):
    return subprocess.run(["psql", "-h", "localhost", "-U", "postgres", "-d", "gaurangadham", "-tAc", s], capture_output=True, text=True).stdout.strip()


res = []


def check(name, ok, extra=""):
    res.append((name, ok))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{extra}]" if extra and not ok else ""))


def settle(pg):
    pg.wait_for_load_state("networkidle")
    try:
        pg.locator(".logo3d").first.wait_for(state="detached", timeout=15000)
    except Exception:
        pass


def login(b, u, pw, w=1280):
    ctx = b.new_context(viewport={"width": w, "height": 900})
    ctx.add_init_script("sessionStorage.setItem('gb-intro-seen','1')")
    pg = ctx.new_page()
    pg.errs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)[:150]))
    pg.goto(B + "/login"); pg.fill("#identifier", u); pg.fill("#password", pw); pg.click("button:has-text('Log in')")
    pg.wait_for_url(re.compile("/(dashboard|welcome)"))
    if "/welcome" in pg.url:
        pg.click("text=Skip the tour"); pg.wait_for_url(re.compile("/dashboard"))
    settle(pg)
    return pg


def stat(pg, label):
    """Value of a StatCard by its exact label."""
    lab = pg.locator("p", has_text=re.compile("^" + re.escape(label) + "$")).first
    return num(lab.locator("xpath=../../p[contains(@class,'font-display')]").inner_text())


def num(s):
    return int(re.sub(r"[^\d-]", "", s) or 0)


HYD = q("select id from dham where name='Hyderabad Dham'")
WGL = q("select id from dham where name='Warangal Dham'")
DEV = q("select id from \"user\" where phone='9000000013'")
DEV_NAME = q(f"select name from \"user\" where id='{DEV}'")
OTHER_DEV = q(f"select id from \"user\" where dham_id={WGL} and role='devotee' limit 1")

# Independent ledger balance: everything in minus everything out for the holder (corrections included).
def ledger(holder):
    return int(q(f"select coalesce(sum(case when to_holder='{holder}' then qty else 0 end) - sum(case when from_holder='{holder}' then qty else 0 end),0) from stock_movement where '{holder}' in (to_holder, from_holder)") or 0)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1243/chrome-linux64/chrome")

    # ---------------- Chakra Sevak: Level 1 → 2 → 3
    a = login(b, "9000000001", "admin123")
    a.goto(B + "/dham"); settle(a)
    cards = a.locator("[data-testid=dham-card]")
    check("L1: one card per Dham", cards.count() == int(q("select count(*) from dham")))
    check("L1: breadcrumb Chakra Sevak / Dhams", a.get_by_role("navigation", name="You are here").inner_text().replace("\n", " ").strip().startswith("Chakra Sevak"))
    a.locator("[data-testid=dham-card]", has_text="Hyderabad Dham").click()
    a.wait_for_url(re.compile(f"/dham/{HYD}$")); settle(a)
    check("L2: heading 'Devotees — Hyderabad Dham'", a.get_by_role("heading", name="Devotees — Hyderabad Dham").count() == 1)
    shelf_ui = stat(a, "On the Dham shelf")
    check("L2: shelf count = ledger balance", shelf_ui == ledger(f"dham:{HYD}"), f"ui {shelf_ui} vs {ledger(f'dham:{HYD}')}")

    # every devotee's "Left" equals their ledger balance
    rows = a.locator("table tbody tr")
    ok, bad = True, []
    for i in range(rows.count()):
        r = rows.nth(i)
        link = r.locator("[data-testid=devotee-row]")
        uid = link.get_attribute("href").split("/devotee/")[1].split("?")[0]
        left = num(r.locator("td").nth(4).inner_text())
        if left != ledger(f"devotee:{uid}"):
            ok = False; bad.append((uid, left, ledger(f"devotee:{uid}")))
    check("L2: every devotee 'Left' = ledger balance", ok and rows.count() > 0, str(bad))
    check("L2: only this Dham's devotees listed",
          rows.count() == int(q(f"select count(*) from \"user\" u where u.dham_id={HYD} and u.is_active and (u.role='devotee' or (u.role='manager' and exists(select 1 from stock_movement m where m.devotee_id=u.id and m.kind='assign_devotee' and m.reversed_by is null)))")))

    # search + sort, then open devotee and come back with the same filters
    a.fill("#q", DEV_NAME.split()[0]); a.select_option("#sort", "sold"); a.click("button:has-text('Search')")
    a.wait_for_url(re.compile(r"q=")); settle(a)
    check("L2: search finds the devotee", a.locator("table [data-testid=devotee-row]").count() >= 1 and DEV_NAME in a.locator("table").inner_text())
    list_url = a.url
    a.locator("table [data-testid=devotee-row]", has_text=DEV_NAME).click()
    a.wait_for_url(re.compile(f"/dham/{HYD}/devotee/{DEV}")); settle(a)
    crumbs = a.get_by_role("navigation", name="You are here").inner_text().replace("\n", " ")
    check("L3: breadcrumb Chakra Sevak › Dhams › Hyderabad Dham › Devotees › name", all(x in crumbs for x in ["Chakra Sevak", "Dhams", "Hyderabad Dham", "Devotees", DEV_NAME]), crumbs)

    # summary cards vs database
    given = int(q(f"select coalesce(sum(qty),0) from stock_movement where devotee_id='{DEV}' and kind='assign_devotee' and reversed_by is null"))
    sold = int(q(f"select coalesce(sum(qty),0) from stock_movement where devotee_id='{DEV}' and kind='sold' and reversed_by is null"))
    card = lambda label: stat(a, label)
    check("L3: received card matches DB", card("Books received") == given, f"{card('Books received')} vs {given}")
    check("L3: sold card matches DB", card("Sold (approved)") == sold)
    check("L3: remaining card = ledger", card("Remaining with devotee") == ledger(f"devotee:{DEV}"))
    check("L3: book rows = books ever given", a.locator("[data-testid=book-row]").count() == int(q(f"select count(distinct book_id) from stock_movement where devotee_id='{DEV}' and kind='assign_devotee' and reversed_by is null")))

    # Sales tab with a custom date range
    a.click("text=🛍️ Sales"); a.wait_for_url(re.compile("tab=sales")); settle(a)
    total_lines = int(q(f"select count(*) from daily_report_line l join daily_report r on r.id=l.report_id where r.devotee_id='{DEV}' and l.sold_qty>0 and r.status<>'draft'"))
    check("L3 Sales: all sent sale lines listed", a.locator("[data-testid=sale-row]").count() == min(total_lines, 50), f"{a.locator('[data-testid=sale-row]').count()} vs {total_lines}")
    frm = q(f"select to_char({IST} - 3,'YYYY-MM-DD')"); to = q(f"select to_char({IST} - 1,'YYYY-MM-DD')")
    a.fill("input[name=from]", frm); a.fill("input[name=to]", to); a.click("button:has-text('Apply')")
    a.wait_for_url(re.compile("preset=custom")); settle(a)
    exp_qty = int(q(f"select coalesce(sum(l.sold_qty),0) from daily_report_line l join daily_report r on r.id=l.report_id where r.devotee_id='{DEV}' and l.sold_qty>0 and r.status<>'draft' and r.report_date between '{frm}' and '{to}'"))
    check("L3 Sales: From/To filter total matches DB", num(a.locator("[data-testid=sales-qty]").inner_text()) == exp_qty, f"{a.locator('[data-testid=sales-qty]').inner_text()} vs {exp_qty}")
    dates_ok = all(frm <= q(f"select to_char(to_date('{c.split(chr(9))[0]}','DD Mon YYYY'),'YYYY-MM-DD')") <= to for c in [r.locator("td").first.inner_text() for r in a.locator("[data-testid=sale-row]").all()[:5]])
    check("L3 Sales: rows inside the date range", dates_ok)
    a.get_by_role("link", name="Today", exact=True).click(); a.wait_for_url(re.compile("preset=today")); settle(a)
    check("L3 Sales: Today preset applied", "preset=today" in a.url)

    # History tab
    a.goto(B + f"/dham/{HYD}/devotee/{DEV}?tab=history"); settle(a)
    mv = int(q(f"select count(*) from stock_movement where devotee_id='{DEV}'"))
    check("L3 History: every ledger movement listed", a.locator("[data-testid=history-row]").count() == min(mv, 50), f"{a.locator('[data-testid=history-row]').count()} vs {mv}")
    a.select_option("select[name=kind]", "assign_devotee"); a.click("button:has-text('Apply')"); settle(a)
    check("L3 History: type filter", a.locator("[data-testid=history-row]").count() == int(q(f"select count(*) from stock_movement where devotee_id='{DEV}' and kind='assign_devotee'")))

    # Back keeps the list filters
    a.goto(list_url); settle(a)
    a.locator("table [data-testid=devotee-row]", has_text=DEV_NAME).click(); settle(a)
    a.click("text=← Back to devotees"); settle(a)
    check("Back returns to filtered list", "q=" in a.url and "sort=sold" in a.url, a.url)

    # Inventory tab
    a.goto(B + f"/dham/{HYD}?tab=inventory"); settle(a)
    check("L2 Inventory tab shows books", a.get_by_role("heading", name="Book Inventory — Hyderabad Dham").count() == 1 and a.locator("table tbody tr").count() > 0)
    check("no page errors (admin)", not a.errs, str(a.errs))

    # ---------------- Sector Sevak: own Dham only
    m = login(b, "9000000002", "manager123", w=390)
    m.goto(B + "/dham"); settle(m)
    check("Manager: /dham opens own Dham", re.search(f"/dham/{HYD}$", m.url) is not None, m.url)
    check("Manager: breadcrumb Sector Sevak / My Dham", "Sector Sevak" in m.get_by_role("navigation", name="You are here").inner_text())
    m.locator("[data-testid=devotee-row]", has_text=DEV_NAME).first.click(); settle(m)
    check("Manager: opens devotee detail", f"/devotee/{DEV}" in m.url and m.get_by_text("Remaining with devotee").count() == 1)
    r1 = m.goto(B + f"/dham/{WGL}"); check("Manager: other Dham blocked (404)", r1.status == 404)
    r2 = m.goto(B + f"/dham/{HYD}/devotee/{OTHER_DEV}"); check("Manager: other Dham's devotee blocked (404)", r2.status == 404)
    r3 = m.goto(B + f"/dham/{WGL}/devotee/{OTHER_DEV}"); check("Manager: other Dham's devotee via its Dham blocked (404)", r3.status == 404)
    check("no page errors (manager)", not m.errs, str(m.errs))

    # ---------------- Devotee: own data only
    d = login(b, "9000000013", "devotee123", w=390)
    d.goto(B + "/dham"); settle(d)
    check("Devotee: /dham not allowed", "/dham" not in d.url, d.url)
    r4 = d.goto(B + f"/dham/{HYD}/devotee/{DEV}"); settle(d)
    check("Devotee: admin devotee page not allowed", "/dham/" not in d.url, d.url)
    d.goto(B + "/my/history"); settle(d)
    check("Devotee: own Books tab", d.get_by_role("heading", name="My Books, Sales & History").count() == 1 and d.locator("[data-testid=book-row]").count() > 0)
    check("Devotee: same remaining as admin view", stat(d, "Remaining with devotee") == ledger(f"devotee:{DEV}"))
    d.goto(B + "/my/history?tab=sales"); settle(d)
    check("Devotee: own sales listed", d.locator("[data-testid=sale-row]").count() == min(total_lines, 50))
    check("Devotee: no report links to manager pages", d.locator("a[href^='/reports/']").count() == 0)
    check("no page errors (devotee)", not d.errs, str(d.errs))

print(f"\n{sum(1 for _, ok in res if ok)}/{len(res)} passed")
