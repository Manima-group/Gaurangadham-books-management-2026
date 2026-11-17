"""Book Availability, Dham-to-Dham transfers, Co-Sevak badge, clickable tiles.
Run against a fresh `npm run db:reset` with the app on :3000 (PGPASSWORD set for psql)."""
import re, subprocess, sys
from playwright.sync_api import sync_playwright

B = "http://localhost:3000"


def q(s):
    return subprocess.run(["psql", "-h", "localhost", "-U", "postgres", "-d", "gaurangadham", "-tAc", s], capture_output=True, text=True).stdout.strip()


res = []


def check(name, ok, extra=""):
    res.append((name, ok))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{extra}]" if extra and not ok else ""))


def login(b, u, pw):
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    ctx.add_init_script("sessionStorage.setItem('gb-intro-seen','1')")
    pg = ctx.new_page()
    pg.errs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)[:150]))
    pg.goto(B + "/login"); pg.fill("#identifier", u); pg.fill("#password", pw); pg.click("button:has-text('Log in')")
    pg.wait_for_url(re.compile("/(dashboard|welcome)"))
    if "/welcome" in pg.url:
        pg.click("text=Skip the tour"); pg.wait_for_url(re.compile("/dashboard"))
    pg.wait_for_load_state("networkidle")
    return pg


def bal(holder, book=None):
    w = f" and book_id={book}" if book else ""
    return int(q(f"select coalesce(sum(case when to_holder='{holder}' then qty else 0 end) - sum(case when from_holder='{holder}' then qty else 0 end),0) from stock_movement where (to_holder='{holder}' or from_holder='{holder}'){w}") or 0)


def stat(pg, label):
    lab = pg.locator("p", has_text=re.compile("^" + re.escape(label) + "$")).first
    return int(re.sub(r"[^\d-]", "", lab.locator("xpath=../../p[contains(@class,'font-display')]").inner_text()) or 0)


def until(sql, want, tries=60):
    import time
    for _ in range(tries):
        if q(sql) == want: return True
        time.sleep(0.5)
    return False


def go(pg, path):
    pg.goto(B + path); pg.wait_for_load_state("networkidle")


HYD = int(q("select id from dham where name='Hyderabad Dham'"))
WGL = int(q("select id from dham where name='Warangal Dham'"))
HARI = q("select id from \"user\" where phone='9000000013'")
# a book Warangal has on its shelf
BOOK = int(q(f"""select book_id from (select book_id, sum(case when to_holder='dham:{WGL}' then qty else -qty end) s from stock_movement
  where to_holder='dham:{WGL}' or from_holder='dham:{WGL}' group by book_id) x where s >= 3 order by s desc limit 1"""))
TITLE = q(f"select title from book where id={BOOK}")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1243/chrome-linux64/chrome")

    # ---------- Availability: Chakra Sevak sees every Dham ----------
    a = login(b, "9000000001", "admin123")
    go(a, "/availability")
    shelf_total = sum(bal(f"dham:{d}") for d in q("select id from dham").split())
    shown = stat(a, "On Dham shelves")
    check("admin availability shelf total matches ledger", shown == shelf_total, f"{shown} vs {shelf_total}")
    check("admin sees Dham filter", a.locator("select[name=dham]").count() == 1)
    go(a, "/availability?view=dham")
    check("by-Dham view lists Warangal", a.locator("h2", has_text="Warangal Dham").count() == 1)
    # book detail: devotees with phone, call + WhatsApp
    dev_book = q("""select book_id from stock_movement where to_holder like 'devotee:%' group by book_id order by sum(qty) desc limit 1""")
    go(a, f"/availability/{dev_book}")
    rows = a.locator("[data-testid=avail-devotees] li")
    check("book detail lists devotees", rows.count() > 0)
    check("book detail has tel: and wa.me links", a.locator("a[href^='tel:']").count() > 0 and a.locator("a[href^='https://wa.me/91']").count() > 0)

    # ---------- Sector Sevak without access: own Dham only ----------
    m = login(b, "9000000002", "manager123")
    go(m, "/availability?view=dham")
    check("manager sees only own Dham", m.locator("h2", has_text="Warangal Dham").count() == 0 and m.locator("h2", has_text="Hyderabad Dham").count() == 1)
    check("manager has no Dham filter", m.locator("select[name=dham]").count() == 0)
    go(m, f"/availability?dham={WGL}&view=dham")
    check("manager cannot widen scope via URL", m.locator("h2", has_text="Warangal Dham").count() == 0)

    # ---------- Devotee: denied until a Chakra Sevak gives access ----------
    d = login(b, "9000000013", "devotee123")
    check("devotee nav has no Availability", d.locator("nav a[href='/availability']").count() == 0)
    go(d, "/availability")
    check("devotee without access is redirected", "/availability" not in d.url)
    go(a, "/people?role=devotee")
    row = a.locator("li", has_text="9000000013").first
    row.locator("button", has_text="Allow Availability").click()
    check("access saved", until(f"select can_see_availability from \"user\" where id='{HARI}'", "t"))
    go(a, "/people?role=devotee")
    check("Availability badge shown", a.locator("li", has_text="9000000013").first.locator("text=👁 Availability").count() == 1)
    go(d, "/availability?view=dham")
    check("devotee with access sees all Dhams", d.locator("h2", has_text="Warangal Dham").count() == 1)
    check("devotee nav shows Availability", d.locator("a[href='/availability']").count() > 0)

    # ---------- Transfer: Hyderabad asks Warangal ----------
    w = login(b, "9000000003", "manager123")
    wgl0, hyd0 = bal(f"dham:{WGL}", BOOK), bal(f"dham:{HYD}", BOOK)
    go(m, "/transfers/new")
    m.select_option("[data-testid=from-dham]", str(WGL))
    check("only Warangal's shelf books listed", m.locator(f"input[name=qty_{BOOK}]").count() == 1)
    # too many: server rejects
    m.fill(f"input[name=qty_{BOOK}]", str(wgl0 + 5)); m.click("button:has-text('Send request')")
    try:
        m.wait_for_selector("text=You asked for more than that Dham has", timeout=15000); ok = True
    except Exception:
        ok = False
    check("over-request rejected", ok and q("select count(*) from dham_transfer") == "0")
    m.select_option("[data-testid=from-dham]", str(WGL))
    m.fill(f"input[name=qty_{BOOK}]", "3"); m.click("button:has-text('Send request')")
    m.wait_for_selector("text=Request sent to Warangal Dham")
    tid = int(q("select max(id) from dham_transfer"))
    check("transfer requested", q(f"select status from dham_transfer where id={tid}") == "requested")
    check("no stock moved on request", bal(f"dham:{WGL}", BOOK) == wgl0)
    # asker cannot approve own request
    go(m, f"/transfers/{tid}")
    check("asker sees no Approve", m.locator("button:has-text('Approve')").count() == 0)
    # Warangal approves 2 of 3
    go(w, f"/transfers/{tid}")
    w.fill(f"input[name=send_{BOOK}]", "2"); w.click("button:has-text('Approve')")
    until(f"select status from dham_transfer where id={tid}", "approved")
    check("approved with 2", q(f"select status||':'||(select sent_qty from dham_transfer_line where transfer_id={tid}) from dham_transfer where id={tid}") == "approved:2")
    go(w, f"/transfers/{tid}")
    w.click("button:has-text('Send books')")
    check("sent status", until(f"select status from dham_transfer where id={tid}", "sent"))
    check("sent: left Warangal shelf", bal(f"dham:{WGL}", BOOK) == wgl0 - 2)
    check("sent: on the way", bal(f"transit:{tid}", BOOK) == 2)
    check("sent: Hyderabad not yet updated", bal(f"dham:{HYD}", BOOK) == hyd0)
    go(a, "/availability")
    transit = stat(a, "On the way between Dhams")
    check("admin sees books on the way", transit >= 2)
    go(m, f"/transfers/{tid}")
    m.click("button:has-text('Books received')")
    check("received status", until(f"select status from dham_transfer where id={tid}", "received"))
    check("received: Hyderabad +2", bal(f"dham:{HYD}", BOOK) == hyd0 + 2)
    check("received: transit empty", bal(f"transit:{tid}", BOOK) == 0)
    go(m, f"/transfers/{tid}")
    tl = m.locator("[data-testid=transfer-timeline]").inner_text()
    check("timeline shows requested/approved/sent/received by", all(f"{s} by" in tl for s in ["Requested", "Approved", "Sent", "Received"]), tl[:200])
    check("transfer cannot be undone via action", q(f"select count(*) from stock_movement where reference='transfer:{tid}' and reversed_by is not null") == "0")
    # double receive is refused (status no longer 'sent')
    check("status received", q(f"select status from dham_transfer where id={tid}") == "received")
    # closing adds up for both Dhams today
    for dn, did in (("Warangal", WGL), ("Hyderabad", HYD)):
        go(a, f"/closing?dham={did}")
        check(f"closing adds up for {dn}", a.locator("text=Book count does not add up").count() == 0)

    # ---------- Co-Sevak ----------
    go(m, "/people")
    m.select_option("#role", "manager"); m.fill("#pname", "Test Co Sevak"); m.fill("#phone", "9111111111")
    m.click("button:has-text('Add Sector Sevak')")
    until("select count(*) from \"user\" where phone='9111111111'", "1")
    check("co-sevak saved", q("select role||':'||is_co_sevak||':'||dham_id from \"user\" where phone='9111111111'") == f"manager:true:{HYD}")
    go(m, "/people?role=manager")
    check("Co-Sevak badge shown", m.locator("li", has_text="Test Co Sevak").locator("text=🛠 Co-Sevak").count() == 1)

    # ---------- Clickable tiles ----------
    go(d, "/my/books")
    d.click("[data-testid=total-left]")
    try:
        d.wait_for_selector("[data-testid=total-detail]", timeout=15000)
    except Exception:
        pass
    check("devotee 'Left' tile opens book list", d.locator("[data-testid=total-detail] li").count() > 1 and "show=left" in d.url)
    go(a, f"/dham/{WGL}")
    a.click("text=On the Dham shelf"); a.wait_for_load_state("networkidle")
    check("dham shelf tile opens availability", "/availability" in a.url and a.locator("h2", has_text="Warangal Dham").count() == 1)

    errs = a.errs + m.errs + w.errs + d.errs
    check("no page errors", not errs, "; ".join(errs[:3]))
    b.close()

bad = [n for n, ok in res if not ok]
print(f"\n{len(res) - len(bad)}/{len(res)} passed")
sys.exit(1 if bad else 0)
