"""Books Transfer v2 + Book Availability + Co-Sevak + clickable tiles.
Run against a fresh `npm run db:reset` with the app on :3000 (PGPASSWORD set for psql)."""
import re, subprocess, sys, time
from playwright.sync_api import sync_playwright

B = "http://localhost:3000"
CHROME = "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome"


def q(s):
    return subprocess.run(["psql", "-h", "localhost", "-U", "postgres", "-d", "gaurangadham", "-tAc", s], capture_output=True, text=True).stdout.strip()


res = []


def check(name, ok, extra=""):
    res.append((name, ok))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{extra}]" if extra and not ok else ""))


def until(sql, want, tries=60):
    for _ in range(tries):
        if q(sql) == want:
            return True
        time.sleep(0.5)
    return False


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
    pg.wait_for_load_state("networkidle")
    return pg


def go(pg, path):
    pg.goto(B + path); pg.wait_for_load_state("networkidle")


def bal(holder, book=None):
    w = f" and book_id={book}" if book else ""
    return int(q(f"select coalesce(sum(case when to_holder='{holder}' then qty else 0 end) - sum(case when from_holder='{holder}' then qty else 0 end),0) from stock_movement where (to_holder='{holder}' or from_holder='{holder}'){w}") or 0)


def status(tid):
    return q(f"select status from dham_transfer where id={tid}")


HYD = int(q("select id from dham where name='Hyderabad Dham'"))
WGL = int(q("select id from dham where name='Warangal Dham'"))
HARI = q("select id from \"user\" where phone='9000000013'")        # HYD devotee
NARA = q("select id from \"user\" where phone='9000000021'")        # WGL devotee
BOOK = int(q(f"""select book_id from (select book_id, sum(case when to_holder='dham:{WGL}' then qty else -qty end) s from stock_movement
  where to_holder='dham:{WGL}' or from_holder='dham:{WGL}' group by book_id) x where s >= 10 order by s desc limit 1"""))
NBOOK = int(q(f"""select book_id from (select book_id, sum(case when to_holder='devotee:{NARA}' then qty else -qty end) s from stock_movement
  where to_holder='devotee:{NARA}' or from_holder='devotee:{NARA}' group by book_id) x where s >= 5 order by s desc limit 1"""))
sold0 = q("select coalesce(sum(qty),0) from stock_movement where kind='sold'")
money0 = q("select coalesce(sum(amount_paise),0)||'/'||count(*) from money_submission")
sales0 = q("select coalesce(sum(sales_paise),0) from daily_report")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    a = login(b, "9000000001", "admin123")
    m = login(b, "9000000002", "manager123")      # HYD Sector Sevak
    w = login(b, "9000000003", "manager123")      # WGL Sector Sevak

    # ---------- Navigation label ----------
    check("menu says Books Transfer", m.locator("nav a[href='/transfers']", has_text="Books Transfer").count() > 0)

    # ---------- 1. Dham → Dham: request ----------
    wgl0, hyd0 = bal(f"dham:{WGL}", BOOK), bal(f"dham:{HYD}", BOOK)
    go(m, "/transfers/new")
    check("manager receiver defaults to own shelf", m.locator("[data-testid=dest]").input_value() == f"dham:{HYD}")
    m.fill("[data-testid=book-search]", q(f"select title from book where id={BOOK}"))
    check("manager without access sees no other Dham's devotees", m.locator(f"input[name=source][value='devotee:{NARA}']").count() == 0)
    m.locator(f"input[name=source][value='dham:{WGL}']").check()
    m.fill(f"input[name=qty_{BOOK}]", str(wgl0 + 50)); m.click("button:has-text('Send request')")
    m.wait_for_selector("text=You asked for more than is available", timeout=15000)
    check("insufficient stock refused", q("select count(*) from dham_transfer") == "0")
    m.fill(f"input[name=qty_{BOOK}]", "6"); m.click("button:has-text('Send request')")
    check("request created", until("select count(*) from dham_transfer", "1"))
    t1 = int(q("select max(id) from dham_transfer"))
    check("request moves no stock", bal(f"dham:{WGL}", BOOK) == wgl0)
    check("event logged: requested", q(f"select string_agg(status, ',' order by id) from dham_transfer_event where transfer_id={t1}") == "requested")

    # ---------- 2. Unauthorised approval ----------
    go(m, f"/transfers/{t1}")
    check("requester cannot approve", m.locator("button:has-text('Approve')").count() == 0)

    # ---------- 3. Partial approval + sender assignment (reserves) ----------
    go(w, f"/transfers/{t1}")
    w.fill(f"[data-testid=approve-{BOOK}]", "4")
    w.select_option("[data-testid=sender]", NARA)
    w.click("button:has-text('Approve')")
    check("approved", until(f"select status from dham_transfer where id={t1}", "approved"))
    check("partial approval recorded", q(f"select requested_qty||'/'||approved_qty from dham_transfer_line where transfer_id={t1}") == "6/4")
    check("event: partially_approved", "partially_approved" in q(f"select string_agg(status, ',') from dham_transfer_event where transfer_id={t1}"))
    check("approval does not move stock", bal(f"dham:{WGL}", BOOK) == wgl0)
    go(a, f"/availability/{BOOK}?dham={WGL}")
    shelf_txt = a.locator("#shelves").inner_text()
    check("availability excludes reserved copies", str(wgl0 - 4) in shelf_txt, shelf_txt[:120])

    # ---------- 4. Assigned sender accepts and dispatches (double submit = once) ----------
    n = login(b, "9000000021", "devotee123")
    go(n, "/transfers")
    check("sender sees transfer waiting", n.locator("text=Your turn").count() >= 1)
    go(n, f"/transfers/{t1}")
    n.click("button:has-text('Accept & prepare')")
    check("accepted by sender", until(f"select status from dham_transfer where id={t1}", "accepted"))
    go(n, f"/transfers/{t1}")
    n2 = n.context.new_page(); n2.goto(B + f"/transfers/{t1}"); n2.wait_for_load_state("networkidle")
    n.fill(f"[data-testid=send-{BOOK}]", "5"); n.click("button:has-text('Send books')")
    n.wait_for_selector("text=Only 4 approved", timeout=15000)
    check("cannot send more than approved", status(t1) == "accepted")
    for pg in (n, n2):
        pg.fill(f"[data-testid=send-{BOOK}]", "4")
    n.click("button:has-text('Send books')", no_wait_after=True); n2.click("button:has-text('Send books')", no_wait_after=True)
    check("dispatched", until(f"select status from dham_transfer where id={t1}", "sent"))
    time.sleep(2)
    check("double dispatch = one movement", q(f"select count(*)||'/'||sum(qty) from stock_movement where reference='transfer:{t1}' and kind='transfer_out'") == "1/4")
    check("sender stock debited", bal(f"dham:{WGL}", BOOK) == wgl0 - 4)
    check("in transit", bal(f"transit:{t1}", BOOK) == 4)
    check("receiver not credited yet", bal(f"dham:{HYD}", BOOK) == hyd0)

    # ---------- 5. Partial receipt with a problem → disputed; then reconcile ----------
    go(m, f"/transfers/{t1}")
    m.fill(f"[data-testid=recv-{BOOK}]", "3"); m.fill(f"[data-testid=issue-{BOOK}]", "1 copy missing")
    m.click("button:has-text('Confirm received')")
    check("disputed after partial receipt", until(f"select status from dham_transfer where id={t1}", "disputed"))
    check("only received copies credited", bal(f"dham:{HYD}", BOOK) == hyd0 + 3)
    check("rest stays in transit", bal(f"transit:{t1}", BOOK) == 1)
    go(w, f"/transfers/{t1}")
    w.fill(f"[data-testid=return-{BOOK}]", "1"); w.fill("input[name=note][placeholder*='came back']", "Copy came back with Narayana")
    check("Sector Sevak cannot write off", w.locator(f"[data-testid=lost-{BOOK}]").count() == 0)
    w.click("button:has-text('Reconcile')")
    check("completed after reconcile", until(f"select status from dham_transfer where id={t1}", "completed"))
    check("returned copy back on sender shelf", bal(f"dham:{WGL}", BOOK) == wgl0 - 3)
    check("transit empty", bal(f"transit:{t1}", BOOK) == 0)
    check("conservation: sent 4, received 3, 1 returned → −3 / +3", bal(f"dham:{WGL}", BOOK) - wgl0 == -3 and bal(f"dham:{HYD}", BOOK) - hyd0 == 3)
    go(m, f"/transfers/{t1}")
    tl = m.locator("[data-testid=transfer-timeline]").inner_text()
    check("timeline has every step with who", all(s in tl for s in ["Requested by", "Partially approved by", "Accepted by sender by", "Dispatched by", "Received with a problem by", "Reconciled by", "Completed by"]), tl[:300])

    # ---------- 6. Devotee → devotee across Dhams ----------
    q(f"update \"user\" set can_see_availability=true where id='{HARI}'")
    h = login(b, "9000000013", "devotee123")
    nara0, hari0 = bal(f"devotee:{NARA}", NBOOK), bal(f"devotee:{HARI}", NBOOK)
    hari_books0 = q(f"select coalesce(sum(qty),0) from stock_movement where devotee_id='{HARI}' and kind='assign_devotee'")
    go(h, "/transfers/new")
    h.locator(f"input[name=source][value='devotee:{NARA}']").check()
    h.fill(f"input[name=qty_{NBOOK}]", "2"); h.click("button:has-text('Send request')")
    check("devotee request created", until(f"select count(*) from dham_transfer where to_holder='devotee:{HARI}'", "1"))
    t2 = int(q("select max(id) from dham_transfer"))
    check("routed to source Dham", q(f"select from_dham_id||'/'||to_dham_id||'/'||sender_id from dham_transfer where id={t2}") == f"{WGL}/{HYD}/{NARA}")
    check("source devotee is notified to decide", q(f"select count(*) from notification where user_id='{NARA}' and link='/transfers/{t2}'") == "1")
    go(n, f"/transfers/{t2}")
    check("source devotee sees approval form", n.locator("text=Someone is asking for your books").count() == 1)
    n.click("button:has-text('Approve')")
    check("devotee approved own books → ready to send (no Sevak step)", until(f"select status from dham_transfer where id={t2}", "accepted"))
    check("approved by the devotee", q(f"select approved_by from dham_transfer where id={t2}") == NARA)
    go(n, f"/transfers/{t2}"); n.click("button:has-text('Send books')")
    check("devotee dispatched", until(f"select status from dham_transfer where id={t2}", "sent"))
    go(h, f"/transfers/{t2}"); h.click("button:has-text('Confirm received')")
    check("received in full → completed", until(f"select status from dham_transfer where id={t2}", "completed"))
    check("devotee stock moved exactly once", bal(f"devotee:{NARA}", NBOOK) == nara0 - 2 and bal(f"devotee:{HARI}", NBOOK) == hari0 + 2)
    go(h, "/my/books")
    check("My Books shows 'Given to Devotee — Transfer'", h.locator("text=Given to Devotee — Transfer").count() >= 1)
    check("transfer is not an allocation", q(f"select coalesce(sum(qty),0) from stock_movement where devotee_id='{HARI}' and kind='assign_devotee'") == hari_books0)

    # ---------- 7. Reject and cancel ----------
    go(m, "/transfers/new"); m.locator(f"input[name=source][value='dham:{WGL}']").check()
    m.fill(f"input[name=qty_{BOOK}]", "1"); m.click("button:has-text('Send request')")
    until("select count(*) from dham_transfer", "3"); t3 = int(q("select max(id) from dham_transfer"))
    go(w, f"/transfers/{t3}"); w.click("button:has-text('Reject')")
    check("rejected", until(f"select status from dham_transfer where id={t3}", "declined"))
    go(m, "/transfers/new"); m.locator(f"input[name=source][value='dham:{WGL}']").check()
    m.fill(f"input[name=qty_{BOOK}]", "2"); m.click("button:has-text('Send request')")
    until("select count(*) from dham_transfer", "4"); t4 = int(q("select max(id) from dham_transfer"))
    go(w, f"/transfers/{t4}"); w.click("button:has-text('Approve')"); until(f"select status from dham_transfer where id={t4}", "approved")
    reserved = q(f"select coalesce(sum(approved_qty),0) from dham_transfer_line l join dham_transfer t on t.id=l.transfer_id where t.status in ('approved','accepted') and t.from_holder='dham:{WGL}'")
    check("approval reserves", reserved == "2", reserved)
    go(m, f"/transfers/{t4}"); m.click("button:has-text('Cancel request')")
    check("cancelled", until(f"select status from dham_transfer where id={t4}", "cancelled"))
    check("cancel releases reservation", q(f"select count(*) from dham_transfer where status in ('approved','accepted') and from_holder='dham:{WGL}'") == "0")

    # ---------- 8. Access ----------
    g = login(b, "9000000011", "devotee123")  # devotee without access, not involved
    go(g, "/transfers/new")
    check("devotee without access cannot request", g.locator("text=Requesting books is not turned on for you").count() == 1)
    r = g.goto(B + f"/transfers/{t1}")
    check("uninvolved devotee can't open a transfer (404)", r.status == 404)
    g.goto(B + "/transfers/report"); g.wait_for_load_state("networkidle")
    check("devotee can't open transfer reports", "/transfers/report" not in g.url)

    # ---------- 9. Reports, money and sales untouched ----------
    go(a, "/transfers/report")
    check("report lists transfers", a.locator("[data-testid=transfer-lines] tbody tr").count() >= 4)
    go(a, "/transfers/report?view=dham")
    check("Dham-wise report", a.locator("[data-testid=transfer-groups]", has_text="Warangal Dham → Hyderabad Dham").count() == 1)
    go(a, f"/transfers/report?view=audit&ref={t1}")
    check("audit shows sent/received/returned", a.locator("table tbody tr").count() == 3)
    check("sold totals unchanged", q("select coalesce(sum(qty),0) from stock_movement where kind='sold'") == sold0)
    check("money unchanged", q("select coalesce(sum(amount_paise),0)||'/'||count(*) from money_submission") == money0 and q("select coalesce(sum(sales_paise),0) from daily_report") == sales0)
    for dn, did in (("Warangal", WGL), ("Hyderabad", HYD)):
        go(a, f"/closing?dham={did}")
        check(f"closing adds up for {dn}", a.locator("text=Book count does not add up").count() == 0)

    # ---------- 10. Availability and Co-Sevak (kept from v1) ----------
    go(m, "/availability?view=dham")
    check("manager availability = own Dham only", m.locator("h2", has_text="Warangal Dham").count() == 0)
    go(g, "/availability"); check("devotee without access redirected", "/availability" not in g.url)
    go(m, "/people")
    m.select_option("#role", "manager"); m.fill("#pname", "Test Co Sevak"); m.fill("#phone", "9111111111")
    m.click("button:has-text('Add Sector Sevak')")
    check("co-sevak saved", until("select role||':'||is_co_sevak from \"user\" where phone='9111111111'", "manager:true"))

    errs = a.errs + m.errs + w.errs + n.errs + h.errs + g.errs
    check("no page errors", not errs, "; ".join(errs[:3]))
    b.close()

bad = [n for n, ok in res if not ok]
print(f"\n{len(res) - len(bad)}/{len(res)} passed")
sys.exit(1 if bad else 0)
