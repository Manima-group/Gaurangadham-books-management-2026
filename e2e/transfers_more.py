"""Books Transfer edge cases: concurrent approvals for the same stock, reservations blocking
"give books", other-Dham Sevak refused, Chakra Sevak write-off. Fresh `npm run db:reset`, app on :3000."""
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


def login(b, u, pw):
    ctx = b.new_context(viewport={"width": 1280, "height": 900}); ctx.add_init_script("sessionStorage.setItem('gb-intro-seen','1')")
    pg = ctx.new_page(); pg.goto(B + "/login"); pg.fill("#identifier", u); pg.fill("#password", pw); pg.click("button:has-text('Log in')")
    pg.wait_for_url(re.compile("/(dashboard|welcome)"))
    if "/welcome" in pg.url: pg.click("text=Skip the tour"); pg.wait_for_url(re.compile("/dashboard"))
    return pg


def go(pg, path): pg.goto(B + path); pg.wait_for_load_state("networkidle")


def bal(h, book):
    return int(q(f"select coalesce(sum(case when to_holder='{h}' then qty else 0 end) - sum(case when from_holder='{h}' then qty else 0 end),0) from stock_movement where (to_holder='{h}' or from_holder='{h}') and book_id={book}") or 0)


HYD = int(q("select id from dham where name='Hyderabad Dham'")); WGL = int(q("select id from dham where name='Warangal Dham'"))
BOOK = int(q(f"""select book_id from (select book_id, sum(case when to_holder='dham:{WGL}' then qty else -qty end) s from stock_movement
  where to_holder='dham:{WGL}' or from_holder='dham:{WGL}' group by book_id) x where s >= 10 order by s desc limit 1"""))


def request(pg, qty, source=f"dham:{WGL}"):
    n0 = int(q("select count(*) from dham_transfer"))
    go(pg, "/transfers/new"); pg.locator(f"input[name=source][value='{source}']").check()
    pg.fill(f"input[name=qty_{BOOK}]", str(qty)); pg.click("button:has-text('Send request')")
    until("select count(*) from dham_transfer", str(n0 + 1))
    return int(q("select max(id) from dham_transfer"))


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    a = login(b, "9000000001", "admin123"); m = login(b, "9000000002", "manager123"); w = login(b, "9000000003", "manager123")
    shelf = bal(f"dham:{WGL}", BOOK)
    big = shelf // 2 + 1  # two requests that can't both be approved

    # ---------- Concurrent approvals for the same stock ----------
    t1, t2 = request(m, big), request(m, big)
    w2 = w.context.new_page()
    go(w, f"/transfers/{t1}"); go(w2, f"/transfers/{t2}")
    w.click("button:has-text('Approve')", no_wait_after=True); w2.click("button:has-text('Approve')", no_wait_after=True)
    time.sleep(4)
    st = sorted([q(f"select status from dham_transfer where id={t}") for t in (t1, t2)])
    reserved = int(q(f"select coalesce(sum(approved_qty),0) from dham_transfer_line l join dham_transfer t on t.id=l.transfer_id where t.status='approved' and t.from_holder='dham:{WGL}' and l.book_id={BOOK}") or 0)
    check("only one of two competing approvals succeeds", st == ["approved", "requested"], str(st))
    check("never over-reserved", reserved <= shelf, f"{reserved} > {shelf}")

    # ---------- Reserved copies can't be given to a devotee ----------
    nara = q("select id from \"user\" where phone='9000000021'")
    free = shelf - reserved
    go(w, f"/stock/assign-devotees?devotee={nara}")
    w.fill(f"input[name=qty_{BOOK}]", str(free + 1))
    w.click("button:has-text('Review')")
    try:
        w.click("button:has-text('Confirm — Give to')", timeout=5000)
    except Exception:
        pass
    w.wait_for_timeout(2500)
    check("reserved copies blocked from 'give books'", bal(f"dham:{WGL}", BOOK) == shelf)

    # ---------- Another Dham's Sevak can't approve ----------
    open_t = t1 if q(f"select status from dham_transfer where id={t1}") == "requested" else t2
    go(m, f"/transfers/{open_t}")
    check("requesting Dham's Sevak sees no Approve", m.locator("button:has-text('Approve')").count() == 0)
    go(a, f"/transfers/{open_t}"); a.click("button:has-text('Reject')")
    until(f"select status from dham_transfer where id={open_t}", "declined")

    # ---------- Chakra Sevak write-off of copies that never arrived ----------
    done_t = t2 if open_t == t1 else t1
    go(w, f"/transfers/{done_t}")
    w.fill(f"[data-testid=send-{BOOK}]", "3"); w.click("button:has-text('Send books')")
    until(f"select status from dham_transfer where id={done_t}", "sent")
    go(m, f"/transfers/{done_t}")
    m.fill(f"[data-testid=recv-{BOOK}]", "1"); m.click("button:has-text('Confirm received')")
    check("partially received (no problem noted)", until(f"select status from dham_transfer where id={done_t}", "partially_received"))
    go(a, f"/transfers/{done_t}")
    a.fill(f"[data-testid=lost-{BOOK}]", "2"); a.fill("input[name=note][placeholder*='came back']", "Lost on the bus")
    a.click("button:has-text('Reconcile')")
    check("completed after write-off", until(f"select status from dham_transfer where id={done_t}", "completed"))
    check("write-off recorded as transfer_loss", q(f"select qty||'/'||to_holder from stock_movement where reference='transfer:{done_t}' and kind='transfer_loss'") == "2/damaged")
    check("in transit cleared", bal(f"transit:{done_t}", BOOK) == 0)
    check("sender −3, receiver +1", bal(f"dham:{WGL}", BOOK) == shelf - 3)
    for did in (WGL, HYD):
        go(a, f"/closing?dham={did}")
        check(f"closing adds up for Dham {did}", a.locator("text=Book count does not add up").count() == 0)

    # ---------- Downloads of transfer reports ----------
    for fmt, ct in (("pdf", "application/pdf"), ("xlsx", "application/vnd.openxmlformats")):
        r = a.request.get(B + f"/api/export/transfers?format={fmt}")
        check(f"transfer report {fmt}", r.status == 200 and r.headers["content-type"].startswith(ct) and r.headers["content-disposition"].endswith(f'.{fmt}"; filename*=UTF-8\'\'books-transfer-all-' + q("select to_char(now() at time zone 'Asia/Kolkata','YYYY-MM-DD')") + f".{fmt}"), r.headers.get("content-disposition", ""))
    b.close()

bad = [n for n, ok in res if not ok]
print(f"\n{len(res) - len(bad)}/{len(res)} passed")
sys.exit(1 if bad else 0)
