"""End-to-end tests for the four integrated features: QR registration, payment modes, stock source lots, Shared Book Stall.
Run against a freshly seeded local database (npm run db:reset) and a running `npm start`. Never against production."""
import re, subprocess, threading
from playwright.sync_api import sync_playwright, expect

B = "http://localhost:3000"
def q(s): return subprocess.run(["psql", "-h", "localhost", "-U", "postgres", "-d", "gaurangadham", "-tAc", s], capture_output=True, text=True).stdout.strip()
res = []
def check(name, ok, info=""):
    res.append((name, bool(ok))); print(("PASS " if ok else "FAIL ") + name + (f"  [{info}]" if info and not ok else ""))

def settle(pg):
    pg.wait_for_load_state("networkidle")
    try: pg.locator(".logo3d").first.wait_for(state="detached", timeout=15000)
    except Exception: pass

def ctx_page(b):
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    ctx.add_init_script("sessionStorage.setItem('gb-intro-seen','1')")
    pg = ctx.new_page(); pg.errs = []; pg.on("pageerror", lambda e: pg.errs.append(str(e)[:150]))
    return pg

def login(b, u, pw):
    pg = ctx_page(b)
    pg.goto(B + "/login"); pg.fill("#identifier", u); pg.fill("#password", pw); pg.click("button:has-text('Log in')")
    pg.wait_for_url(re.compile("/(dashboard|welcome)"))
    if "/welcome" in pg.url: pg.click("text=Skip the tour"); pg.wait_for_url(re.compile("/dashboard"))
    settle(pg); return pg

def go(pg, path): pg.goto(B + path); settle(pg)
def msg(pg, pattern, t=20000):
    try: expect(pg.get_by_text(re.compile(pattern)).first).to_be_visible(timeout=t); return True
    except Exception: return False

def uid(phone): return q(f"select id from \"user\" where phone='{phone}'")
BOOK = q("select id from book where title='Perfect Questions, Perfect Answers' and language='English'")
BG = q("select id from book where title='Bhagavad Gita As It Is' and language='English'")
GOV, LAK, SITA = "9000000011", "9000000012", "9000000014"

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1243/chrome-linux64/chrome")

    # =============== A. QR self-registration ===============
    m = login(b, "9000000002", "manager123")
    go(m, "/people/registration")
    m.select_option("#days", "30"); m.click("button:has-text('Create Registration QR')")
    check("A: invite created", msg(m, "Registration link ready"))
    go(m, "/people/registration")
    link = m.locator("[data-testid=invite-link]").first.input_value()
    check("A: link is a /register/<token> URL", re.search(r"/register/[A-Za-z0-9_-]{30,}$", link), link)
    token = link.rsplit("/", 1)[1]
    check("A: invite bound to manager's Dham on server", q(f"select d.name from registration_invite i join dham d on d.id=i.dham_id where token='{token}'") == "Hyderabad Dham")
    r = m.request.get(B + m.locator("[data-testid=invite-pdf]").first.get_attribute("href"))
    check("A: QR PDF downloads", r.status == 200 and r.body()[:5] == b"%PDF-", r.status)
    # Warangal Sevak cannot download Hyderabad's QR
    k = login(b, "9000000003", "manager123")
    iid = q(f"select id from registration_invite where token='{token}'")
    check("A: other Dham's Sevak can't download QR", k.request.get(f"{B}/api/register/qr/{iid}").status == 404)

    newp = ctx_page(b)
    newp.goto(link); settle(newp)
    check("A: landing shows Dham — Sector", "Hyderabad Dham" in newp.locator("[data-testid=register-context]").inner_text() and "Madhava" in newp.locator("[data-testid=register-context]").inner_text())
    newp.fill("#name", "Test Registrant"); newp.fill("#phone", "9876500001"); newp.fill("#password", "secret12"); newp.fill("#confirm", "secret12")
    newp.click("button:has-text('Register')")
    check("A: consent required", msg(newp, "agree to continue"))
    newp.check("input[name=consent]"); newp.click("button:has-text('Register')")
    newp.wait_for_url(re.compile("/dashboard"), timeout=30000); settle(newp)
    check("A: logged in at once to pending dashboard", newp.locator("[data-testid=pending-dashboard]").count() == 1 and newp.get_by_text("Awaiting Sector Sevak Approval").count() >= 1)
    reg = uid("9876500001")
    check("A: stored pending, both permissions off, phone not verified", q(f"select approval_status||can_distribute_books||can_view_dham_sales||email_verified from \"user\" where id='{reg}'") == "pendingfalsefalsefalse")
    for path in ["/my/books", "/my/sales", "/my/money", "/stalls", "/contacts/mine", "/dham-sales"]:
        go(newp, path)
        check(f"A: pending user denied {path}", "/dashboard" in newp.url and newp.locator("[data-testid=pending-dashboard]").count() == 1, newp.url)
    check("A: pending user denied export API", newp.request.get(B + "/api/export/reports").status in (401, 403))
    nav = newp.locator("nav").first.inner_text() if newp.locator("nav").count() else ""
    check("A: pending nav shows no book items", "My Books" not in nav and "Add Today" not in nav)
    # duplicate phone: refused without merging
    dup = ctx_page(b); dup.goto(link); settle(dup)
    dup.fill("#name", "Someone Else"); dup.fill("#phone", "9876500001"); dup.fill("#password", "secret12"); dup.fill("#confirm", "secret12"); dup.check("input[name=consent]")
    dup.click("button:has-text('Register')")
    check("A: duplicate phone refused (no merge)", msg(dup, "already has an account") and q("select count(*) from \"user\" where phone='9876500001'") == "1")
    # revoked invite
    m2tok = None
    go(m, "/people/requests")
    check("A: request in queue", m.get_by_text("Test Registrant").count() >= 1)
    m.get_by_label("Select Test Registrant").check()
    m.locator("button:has-text('Approve')").click()
    check("A: approved", msg(m, "approved"))
    check("A: approval grants nothing", q(f"select approval_status||can_distribute_books||can_view_dham_sales from \"user\" where id='{reg}'") == "approvedfalsefalse")
    check("A: approval audited", q(f"select count(*) from access_audit where user_id='{reg}' and permission='approval' and new_value='approved'") == "1")
    go(newp, "/dashboard")
    if "/welcome" in newp.url: newp.click("text=Skip the tour"); newp.wait_for_url(re.compile("/dashboard")); settle(newp)
    check("A: limited dashboard (distribution off)", newp.locator("[data-testid=limited-dashboard]").count() == 1)
    go(newp, "/my/books")
    check("A: approved w/o distribution still denied books", "/my/books" not in newp.url, newp.url)
    go(newp, "/account")
    check("A: profile shows Book Distribution: Disabled", newp.locator("[data-testid=acct-distribution]").inner_text() == "Disabled")
    # toggle on with reason — takes effect in the live session
    go(m, "/people?role=devotee")
    row = m.locator("li", has_text="Test Registrant").first
    row.locator("[data-testid=toggle-book_distribution]").click()
    f_ = row.locator("form:has(input[name=permission][value=book_distribution])")
    f_.locator("input[name=reason]").fill("Ready for seva")
    f_.locator("button[type=submit]").click()
    check("A: distribution enabled", msg(m, "Book Distribution enabled"))
    a = q(f"select actor_id||'|'||old_value||'|'||new_value||'|'||reason from access_audit where user_id='{reg}' and permission='book_distribution'")
    check("A: toggle audited (actor, old, new, reason)", a == f"{uid('9000000002')}|off|on|Ready for seva", a)
    go(newp, "/my/books")
    check("A: live session gains access at once", "/my/books" in newp.url)
    go(newp, "/account")
    check("A: profile shows Enabled", newp.locator("[data-testid=acct-distribution]").inner_text() == "Enabled")
    # Dham Sales View
    go(m, "/people?role=devotee"); row = m.locator("li", has_text="Test Registrant").first
    row.locator("[data-testid=toggle-dham_sales_view]").click(); row.locator("form:has(input[name=permission][value=dham_sales_view]) button[type=submit]").click()
    msg(m, "Dham Sales View enabled")
    go(newp, "/dham-sales")
    check("A: Dham Sales View page loads", "/dham-sales" in newp.url and newp.get_by_text("Books distributed").count() >= 1)
    html = newp.content()
    check("A: Dham Sales shows no devotee names", "Govinda Sharma" not in html and "Lakshmi Reddy" not in html)
    # Warangal Sevak cannot change Hyderabad devotee access (server check)
    go(k, "/people/requests")
    check("A: other Dham Sevak doesn't see the request queue entry", k.get_by_text("Test Registrant").count() == 0)
    # revoke invite → link stops working
    go(m, "/people/registration"); m.locator("[data-testid=invite-revoke]").first.click(); settle(m)
    r2 = ctx_page(b); r2.goto(link); settle(r2)
    check("A: revoked link refused", r2.locator("[data-testid=register-invalid]").count() == 1)
    check("A: no page errors", not (newp.errs or m.errs), (newp.errs + m.errs)[:2])

    # =============== C. Stock source lots ===============
    go(m, "/stock/receive")
    check("C: receive form offers both sources", m.locator("[data-testid=source-temple_store]").count() == 1 and m.locator("[data-testid=source-external_central]").count() == 1)
    adm = login(b, "9000000001", "admin123")
    go(adm, "/stock/sources")
    check("C: admin sees Stock Sources", adm.locator("[data-testid=source-totals]").count() == 1)
    go(m, "/stock/sources")
    check("C: Sector Sevak sees Stock Sources", m.locator("[data-testid=source-totals]").count() == 1 and "Unknown" in m.content())
    gov = login(b, GOV, "devotee123")
    go(gov, "/stock/sources")
    check("C: devotee denied Stock Sources", "/stock/sources" not in gov.url)
    leak = []
    for path in ["/dashboard", "/my/books", "/my/sales", "/my/money", "/stalls", "/account", "/my/reports"]:
        go(gov, path); h = gov.content()
        for w in ["Temple Store", "External Central", "temple_store", "external_central", "LOT-", "lot_id", "lotId"]:
            if w in h: leak.append(f"{path}:{w}")
    check("C: devotee pages never contain source data", not leak, leak[:4])

    # =============== B. Payment modes ===============
    hari = login(b, "9000000013", "devotee123")
    go(hari, "/my/sales")
    gov_ = gov; gov = hari
    gov.fill("#venue_0_name", "Ameerpet")
    gov.get_by_label("Bhagavad Gita As It Is (English) sold at place 1", exact=True).fill("2")
    price = int(q(f"select price_paise from book where id={BG}"))
    gov.locator("[data-testid=pay-split]").check(force=True)
    gov.locator("[data-testid=cash-part]").fill(str(price // 100)); gov.locator("[data-testid=upi-part]").fill(str(price // 100 - 1))
    gov.click("button:has-text('Send ✓')")
    check("B: split must add up", msg(gov, "Cash \\+ UPI must equal"))
    gov.locator("[data-testid=upi-part]").fill(str(price // 100))
    gov.click("button:has-text('Send ✓')")
    check("B: split sales report saved", msg(gov, "saved. 🙏|are sent 🙏"))
    rr = q(f"select payment_mode||'|'||cash_paise||'|'||upi_paise||'|'||collected_paise from daily_report where devotee_id='{uid('9000000013')}' order by id desc limit 1")
    check("B: report stores cash + UPI = collected (integer paise)", rr == f"split|{price}|{price}|{2*price}", rr)
    # Money: UPI without reference is accepted; split validated; replay is idempotent
    go(gov, "/my/money")
    gov.fill("#amount", "10"); gov.locator("[data-testid=method-upi]").check(force=True)
    posted = {}
    gov.on("request", lambda rq: posted.setdefault("r", rq) if rq.method == "POST" and "next-action" in {k.lower() for k in rq.headers} else None)
    gov.click("button:has-text('Submit Money')")
    check("B: UPI without reference accepted", msg(gov, "submitted. Thank you"))
    n1 = q(f"select count(*) from money_submission where devotee_id='{uid("9000000013")}'")
    if "r" in posted:
        rq = posted["r"]
        hdr = {k: v for k, v in rq.headers.items() if k.lower() in ("next-action", "next-router-state-tree", "content-type", "accept")}
        gov.request.post(rq.url, headers=hdr, data=rq.post_data_buffer)
    n2 = q(f"select count(*) from money_submission where devotee_id='{uid("9000000013")}'")
    check("B: replaying the same submission doesn't double-post", "r" in posted and n1 == n2, f"{n1}->{n2}")
    go(gov, "/my/money")
    gov.fill("#amount", "10"); gov.locator("[data-testid=method-split]").check(force=True); gov.fill("#cashPart", "4"); gov.fill("#upiPart", "5")
    gov.click("button:has-text('Submit Money')")
    check("B: money split must add up", msg(gov, "must equal the amount"))
    gov.fill("#upiPart", "6"); gov.click("button:has-text('Submit Money')")
    check("B: money split saved", msg(gov, "submitted. Thank you") and q(f"select method||cash_paise||'/'||upi_paise from money_submission where devotee_id='{uid("9000000013")}' order by id desc limit 1") == "split400/600")

    gov = gov_
    # =============== D. Shared Book Stall (15/5/5 example) ===============
    go(gov, "/stalls")
    gov.fill("#name", "E2E Sunday Stall"); gov.click("button:has-text('Create Stall')")
    gov.wait_for_url(re.compile(r"/stalls/\d+"), timeout=30000); settle(gov)
    sid = gov.url.rstrip("/").rsplit("/", 1)[1]
    check("D: stall created, creator is coordinator", q(f"select coordinator_id='{uid(GOV)}' and status='draft' from book_stall where id={sid}") == "t")
    for who in ["Lakshmi Reddy", "Sita Devi"]:
        gov.select_option("#userId", label=who); gov.click("button:has-text('Invite')"); msg(gov, "invited"); settle(gov)
    lak = login(b, LAK, "devotee123"); sita = login(b, SITA, "devotee123")
    free_before = {}
    for pg, ph, n in [(gov, GOV, "15"), (lak, LAK, "5"), (sita, SITA, "5")]:
        go(pg, f"/stalls/{sid}")
        if pg is not gov: pg.click("button:has-text('Accept & Join')"); msg(pg, "joined"); settle(pg)
        pg.locator(f"[data-testid=contrib-{BOOK}]").fill(n); pg.click("button:has-text('Add to Stall')")
        check(f"D: {ph} contributed {n}", msg(pg, "copies added"))
    check("D: contributions reserved (no ledger movement yet)", q(f"select count(*) from stock_movement where stall_id={sid}") == "0" and q(f"select sum(qty) from stall_contribution where stall_id={sid} and status='confirmed'") == "25")
    # reserved copies can't be reported as sold elsewhere: Lakshmi has 18 free, 5 now on the stall -> 15 is too many
    old_day = q("select ((now() at time zone 'Asia/Kolkata')::date - 6)::text")
    go(lak, f"/my/sales?date={old_day}")
    lak.fill("#venue_0_name", "Test")
    lak.get_by_label("Perfect Questions, Perfect Answers (English) sold at place 1", exact=True).fill("15")
    lak.click("button:has-text('Send ✓')")
    check("D: reserved copies excluded from daily sales", msg(lak, "more than the books you have|only"))
    go(gov, f"/stalls/{sid}"); gov.click("button:has-text('Open Stall')"); msg(gov, "open"); settle(gov)
    # Quick sell: 3 cash (Govinda), 3 split (Lakshmi), 4 UPI (Sita)
    def sell(pg, n, mode, cash=None, upi=None):
        go(pg, f"/stalls/{sid}")
        for _ in range(n): pg.locator(f"[data-testid=plus-{BOOK}]").click()
        pg.locator(f"[data-testid=sell-mode-{mode}]").check(force=True)
        if mode == "split": pg.locator("[data-testid=sell-cash]").fill(cash); pg.locator("[data-testid=sell-upi]").fill(upi)
        pg.click("button:has-text('Record Sale')")
        return msg(pg, "Sold ")
    cprice = int(q(f"select price_paise from book where id={BOOK}"))
    check("D: quick sell cash", sell(gov, 3, "cash"))
    check("D: quick sell split", sell(lak, 3, "split", str(cprice // 100), str(2 * cprice // 100)))
    check("D: quick sell UPI", sell(sita, 4, "upi"))
    # undo one sale (auditable reversal) and sell again
    go(sita, f"/stalls/{sid}")
    last = q(f"select id from stall_sale where stall_id={sid} and operator_id='{uid(SITA)}' order by id desc limit 1")
    u_ = sita.locator(f"details:has([data-testid=undo-{last}])"); u_.locator("summary").click(); u_.locator("input[name=reason]").fill("wrong count"); u_.locator("button:has-text('Undo sale')").click(); sita.wait_for_timeout(1500)
    check("D: undo recorded as reversal (original kept)", q(f"select count(*) from stall_sale where reversal_of={last}") == "1" and q(f"select sum(qty) from stall_sale_line where stall_id={sid}") == "6")
    check("D: quick sell after undo", sell(sita, 4, "upi"))
    # idempotent replay of a quick sell request
    posted = {}
    lak.on("request", lambda rq: posted.setdefault("r", rq) if rq.method == "POST" and "next-action" in {k.lower() for k in rq.headers} else None)
    go(lak, f"/stalls/{sid}")
    before = q(f"select count(*) from stall_sale where stall_id={sid}")
    # oversell guard: 15 left; try 16 via two pages at once (8 + 8)
    def try_sell(pg, n):
        go(pg, f"/stalls/{sid}")
        for _ in range(n): pg.locator(f"[data-testid=plus-{BOOK}]").click()
    try_sell(gov, 8); try_sell(lak, 8)
    t1 = threading.Thread(target=lambda: None)
    gov.click("button:has-text('Record Sale')", no_wait_after=True); lak.click("button:has-text('Record Sale')", no_wait_after=True)
    settle(gov); settle(lak); gov.wait_for_timeout(2500)
    sold = int(q(f"select coalesce(sum(qty),0) from stall_sale_line where stall_id={sid}"))
    check("D: concurrent sells (8 + 8 with 15 left) never oversell", sold == 18, sold)
    if "r" in posted:
        rq = posted["r"]
        hdr = {k: v for k, v in rq.headers.items() if k.lower() in ("next-action", "next-router-state-tree", "content-type", "accept")}
        n1 = q(f"select count(*) from stall_sale where stall_id={sid}")
        lak.request.post(rq.url, headers=hdr, data=rq.post_data_buffer)
        check("D: replayed quick-sell request is not double-posted", q(f"select count(*) from stall_sale where stall_id={sid}") == n1)
    else:
        check("D: replayed quick-sell request is not double-posted", False, "no request captured")
    # bring sold back to exactly 10 by undoing the concurrent sale(s)
    for x in q(f"select id from stall_sale where stall_id={sid} and reversal_of is null and reversed_by is null and id > (select max(id) from stall_sale where stall_id={sid} and operator_id='{uid(SITA)}' and reversal_of is null)").split():
        go(gov, f"/stalls/{sid}"); u_ = gov.locator(f"details:has([data-testid=undo-{x}])"); u_.locator("summary").click(); u_.locator("input[name=reason]").fill("test reset"); u_.locator("button:has-text('Undo sale')").click(); gov.wait_for_timeout(1500)
    check("D: net sold is 10", q(f"select sum(qty) from stall_sale_line where stall_id={sid}") == "10")
    # Closing
    go(gov, f"/stalls/{sid}"); gov.click("button:has-text('Stop Selling')"); msg(gov, "Selling stopped"); settle(gov)
    go(lak, f"/stalls/{sid}")
    check("D: no sales after closing starts", lak.locator(f"[data-testid=plus-{BOOK}]").count() == 0)
    go(gov, f"/stalls/{sid}")
    gov.locator(f"[data-testid=count-{BOOK}]").fill("16"); gov.click("button:has-text('Save Count')")
    check("D: count more than possible refused", msg(gov, "check the counts"))
    gov.locator(f"[data-testid=count-{BOOK}]").fill("15"); gov.click("button:has-text('Save Count')"); msg(gov, "Counted"); settle(gov)
    def alloc():
        return q(f"select string_agg(take_home||'/'||attributed_sold, ' ' order by contributed desc, user_id) from stall_allocation a join book_stall s on s.id=a.stall_id and a.version=s.allocation_version where a.stall_id={sid}")
    check("D: default returns 9/3/3, attributed sold 6/2/2", alloc() in ("9/6 3/2 3/2",), alloc())
    # edit Ravi(Govinda) 11, Lakshmi 2, Sita 2  -> sold 4/3/3
    ver1 = q(f"select allocation_version from book_stall where id={sid}")
    go(lak, f"/stalls/{sid}"); lak.click("button:has-text('I confirm')"); msg(lak, "Confirmed")
    go(gov, f"/stalls/{sid}"); gov.click("text=Change take-home copies")
    gov.locator(f"[data-testid=th_{uid(GOV)}_{BOOK}]").fill("11"); gov.locator(f"[data-testid=th_{uid(LAK)}_{BOOK}]").fill("2"); gov.locator(f"[data-testid=th_{uid(SITA)}_{BOOK}]").fill("2")
    gov.click("button:has-text('Save Changes')"); msg(gov, "Saved")
    check("D: edited 11/2/2 -> attributed sold 4/3/3", alloc() == "11/4 2/3 2/3", alloc())
    check("D: changed allocation invalidates earlier confirmation", q(f"select count(*) from stall_confirmation c join book_stall s on s.id=c.stall_id and c.version=s.allocation_version where c.stall_id={sid}") == "0" and ver1 != q(f"select allocation_version from book_stall where id={sid}"))
    for pg in [gov, lak, sita]:
        go(pg, f"/stalls/{sid}"); pg.click("button:has-text('I confirm')"); msg(pg, "Confirmed")
    check("D: all confirmed -> pending approval", q(f"select status from book_stall where id={sid}") == "pending_approval")
    go(m, f"/stalls/{sid}")
    check("D: Sector Sevak sees the stall", m.get_by_text("E2E Sunday Stall").count() >= 1)
    m.click("button:has-text('Approve Closing')"); msg(m, "Approved")
    st = q(f"select status from book_stall where id={sid}")
    check("D: approved and posted -> money to hand over", st == "pending_settlement", st)
    mv = q(f"select string_agg(u.phone||':'||m.qty, ' ' order by u.phone) from stock_movement m join \"user\" u on u.id=m.devotee_id where m.stall_id={sid} and m.kind='sold'")
    check("D: ledger: sold per owner 4/3/3 with stall id", mv == f"{GOV}:4 {LAK}:3 {SITA}:3", mv)
    check("D: lots assigned FIFO on posted movements", q(f"select count(*) from stock_movement where stall_id={sid} and lot_id is null") == q(f"select count(*) from stock_movement where stall_id={sid}"))
    hold = q(f"select sum(case when to_holder='devotee:{uid(GOV)}' then qty else -qty end) from stock_movement where book_id={BOOK} and '{'devotee:'+uid(GOV)}' in (to_holder, from_holder)")
    check("D: Govinda holds 25-4=21 copies", hold == "21", hold)
    go(m, f"/stalls/{sid}")
    check("D: Sevak sees By Source", m.locator("[data-testid=stall-sources]").count() == 1)
    go(gov, f"/stalls/{sid}")
    check("D: devotee doesn't see By Source", gov.locator("[data-testid=stall-sources]").count() == 0 and "Unknown / legacy" not in gov.content())
    # Settlement: each recipient hands over; Sevak confirms; stall closes
    for pg, ph in [(gov, GOV), (lak, LAK), (sita, SITA)]:
        due = int(q(f"select sum(total_paise) from stall_sale where stall_id={sid} and recipient_id='{uid(ph)}'") or 0)
        if not due: continue
        go(pg, "/my/money"); pg.fill("#amount", f"{due/100:g}"); pg.locator("[data-testid=method-cash]").check(force=True); pg.select_option("#stallId", sid)
        pg.click("button:has-text('Submit Money')"); msg(pg, "submitted. Thank you")
    check("D: handovers tagged with stall", q(f"select count(*) from money_submission where stall_id={sid}") == "3")
    for mid in q(f"select id from money_submission where stall_id={sid} order by id").split():
        go(m, "/money?status=submitted")
        form = m.locator(f"form:has(input[name=id][value='{mid}'])").first
        form.locator("button:has-text('Received')").first.click(); settle(m); m.wait_for_timeout(800)
    st = q(f"select status from book_stall where id={sid}")
    check("D: stall closes when all stall money received", st == "closed", st)
    check("D: stall events audited", int(q(f"select count(*) from stall_event where stall_id={sid}")) >= 15)
    check("D: no page errors", not (gov.errs or lak.errs or sita.errs or m.errs), (gov.errs + lak.errs + sita.errs + m.errs)[:2])

    b.close()

ok = sum(1 for _, x in res if x)
print(f"{ok}/{len(res)} passed")
